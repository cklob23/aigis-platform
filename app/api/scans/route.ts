import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { getSession, getTenant, withLiveRole } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { createScanJob, runScan } from '@/lib/scan/engine'
import { audit } from '@/lib/audit'
import { db } from '@/lib/supabase/admin'

export const maxDuration = 300

export async function POST(req: Request) {
  const raw = await getSession()
  if (!raw) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await withLiveRole(raw)
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!can(session.role, 'scan.run')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const tenant = await getTenant(session.tenantId)
  if (!tenant) return NextResponse.json({ error: 'tenant_missing' }, { status: 404 })
  if (!tenant.is_demo && tenant.connection_status !== 'connected') {
    return NextResponse.json({ error: 'Admin consent has not been granted for this tenant yet.' }, { status: 409 })
  }
  const { data: running } = await db().from('scan_jobs').select('id').eq('tenant_id', tenant.id).in('status', ['queued', 'running']).limit(1).maybeSingle()
  if (running) return NextResponse.json({ id: running.id, alreadyRunning: true })

  const body = (await req.json().catch(() => ({}))) as { scanType?: string }
  const scanType = body.scanType ?? (tenant.last_scan_at ? 'manual' : 'initial_full')
  const jobId = await createScanJob(tenant.id, scanType, session.demo ? null : session.userId)
  await audit(session, { action: 'scan.started', targetType: 'scan_job', targetId: jobId, newState: { scan_type: scanType } })
  after(async () => {
    try {
      await runScan(jobId, tenant.id)
    } catch (err) {
      console.log('[v0] scan failed:', err instanceof Error ? err.message : err)
    }
  })
  return NextResponse.json({ id: jobId })
}
