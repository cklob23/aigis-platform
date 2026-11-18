import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { readSession, type Session } from '@/lib/auth/session'
import { can, resolveLiveRole, type Permission } from '@/lib/auth/rbac'
import { db } from '@/lib/supabase/admin'

export type TenantRecord = {
  id: string
  organization_id: string
  ms_tenant_id: string
  display_name: string
  primary_domain: string | null
  verified_domains: string[]
  connection_status: 'pending' | 'consent_required' | 'connected' | 'error'
  consent_granted_at: string | null
  onboarding_step: number
  onboarding_completed_at: string | null
  last_scan_at: string | null
  settings: Record<string, unknown>
  is_demo: boolean
  created_at: string
}

export const getSession = cache(async () => readSession())

export const getTenant = cache(async (tenantId: string): Promise<TenantRecord | null> => {
  const { data } = await db().from('tenants').select('*').eq('id', tenantId).maybeSingle()
  return (data as TenantRecord | null) ?? null
})

export type AppContext = { session: Session; tenant: TenantRecord }

/** JWT role is a cache. Demo keeps it; live tenants reload administrators.role_key. */
export async function withLiveRole(session: Session): Promise<Session | null> {
  if (session.demo) return session
  const { data: admin } = await db()
    .from('administrators')
    .select('role_key')
    .eq('tenant_id', session.tenantId)
    .eq('user_id', session.userId)
    .maybeSingle()
  try {
    return { ...session, role: resolveLiveRole(session, admin?.role_key) }
  } catch {
    return null
  }
}

/** Requires a signed-in session with a tenant. Redirects to the sign-in page otherwise. */
export async function requireContext(): Promise<AppContext> {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  const tenant = await getTenant(session.tenantId)
  if (!tenant) redirect('/auth/login?error=tenant_missing')
  const live = await withLiveRole(session)
  if (!live) redirect('/auth/login?error=not_an_administrator')
  return { session: live, tenant }
}

/** Same as requireContext but also enforces onboarding completion. */
export async function requireOnboarded(): Promise<AppContext> {
  const ctx = await requireContext()
  if (!ctx.tenant.onboarding_completed_at) redirect('/onboarding')
  return ctx
}

export function assertCan(session: Session, permission: Permission) {
  if (!can(session.role, permission)) {
    throw new Error(`Your role does not permit this action (${permission}).`)
  }
}
