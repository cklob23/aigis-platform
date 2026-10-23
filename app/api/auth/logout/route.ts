import { NextResponse, type NextRequest } from 'next/server'
import { absoluteUrl } from '@/lib/auth/microsoft'
import { clearSession, readSession } from '@/lib/auth/session'
import { audit } from '@/lib/audit'

export async function POST(req: NextRequest) {
  const session = await readSession()
  if (session) await audit(session, { action: 'auth.signed_out', targetType: 'user', targetId: session.userId })
  await clearSession()
  return NextResponse.redirect(await absoluteUrl('/auth/login'), { status: 303 })
}
