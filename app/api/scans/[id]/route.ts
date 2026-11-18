import { NextResponse } from 'next/server'
import { getSession, withLiveRole } from '@/lib/auth/current'
import { getScan } from '@/lib/data/governance'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const raw = await getSession()
  if (!raw) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await withLiveRole(raw)
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  const job = await getScan(session.tenantId, id)
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(job)
}
