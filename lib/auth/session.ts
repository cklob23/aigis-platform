import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { env } from '@/lib/env'
import type { RoleKey } from '@/lib/auth/rbac'

export const SESSION_COOKIE = 'gs_session'
const SESSION_TTL_SECONDS = 60 * 60 * 12

export type Session = {
  userId: string
  email: string
  name: string
  tenantId: string
  msTenantId: string
  role: RoleKey
  demo: boolean
}

function secret() {
  return new TextEncoder().encode(env.sessionSecret)
}

export async function createSession(session: Session) {
  const jwt = await new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('guestsweep')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret())
  const store = await cookies()
  store.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function readSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: 'guestsweep' })
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      tenantId: String(payload.tenantId),
      msTenantId: String(payload.msTenantId),
      role: payload.role as RoleKey,
      demo: Boolean(payload.demo),
    }
  } catch {
    return null
  }
}

export async function clearSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
