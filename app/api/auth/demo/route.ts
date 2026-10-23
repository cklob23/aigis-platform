import { NextResponse, type NextRequest } from 'next/server'
import { absoluteUrl } from '@/lib/auth/microsoft'
import { createSession } from '@/lib/auth/session'
import { DEMO_MS_TENANT_ID, ensureDemoUser, getOrCreateDemoTenant } from '@/lib/demo/seed'
import type { RoleKey } from '@/lib/auth/rbac'
import { demoEnabled } from '@/lib/env'

export const maxDuration = 120

const ROLES: RoleKey[] = ['gs_admin', 'security_analyst', 'auditor', 'read_only']

export async function POST(req: NextRequest) {
  if (!demoEnabled()) {
    return NextResponse.redirect(await absoluteUrl('/auth/login?error=demo_disabled'), { status: 303 })
  }
  try {
    const form = await req.formData().catch(() => null)
    const requested = String(form?.get('role') ?? 'gs_admin') as RoleKey
    const role = ROLES.includes(requested) ? requested : 'gs_admin'
    const tenantId = await getOrCreateDemoTenant()
    const user = await ensureDemoUser()
    await createSession({ userId: user.id, email: user.email, name: user.name, tenantId, msTenantId: DEMO_MS_TENANT_ID, role, demo: true })
    return NextResponse.redirect(await absoluteUrl('/dashboard'), { status: 303 })
  } catch (err) {
    console.log('[v0] demo sign-in failed:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(await absoluteUrl('/auth/login?error=demo_failed'), { status: 303 })
  }
}
