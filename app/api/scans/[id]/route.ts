import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/current'
import { getScan } from '@/lib/data/governance'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const job = await getScan(session.tenantId, id)
  if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(job)
}
