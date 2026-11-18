import 'server-only'
import { db } from '@/lib/supabase/admin'
import { asExternalGuest } from '@/lib/identity/ingest'
import type { Guest, RiskLevel } from '@/lib/types'
import type { RiskCauseKey } from '@/lib/risk/recommendation'

export type IdentityFilters = {
  q?: string
  risk?: RiskLevel | 'all'
  domain?: string
  organization?: string
  status?: 'active' | 'disabled' | 'pending' | 'all'
  activity?: 'inactive90' | 'inactive180' | 'never' | 'all'
  sponsor?: 'none' | 'disabled' | 'all'
  review?: 'never_reviewed' | 'pending' | 'all'
  action?: string
  cause?: RiskCauseKey
  sort?: 'risk' | 'name' | 'last_sign_in' | 'created'
  page?: number
  pageSize?: number
}

const causeFilter = (key: string) => JSON.stringify([{ key }])

/**
 * Identity inventory for the current tenant. Phase 1.5 still stores the
 * external-class extension on guest_identities; this maps those rows to Guest
 * so callers keep the same shape. Fail closed if identity_id is missing.
 */
export async function listIdentities(tenantId: string, f: IdentityFilters) {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(200, f.pageSize ?? 50)
  let q = db().from('guest_identities').select('*', { count: 'exact' }).eq('tenant_id', tenantId).is('removed_at', null)
  if (f.q) q = q.or(`display_name.ilike.%${f.q}%,email.ilike.%${f.q}%,domain.ilike.%${f.q}%,company_name.ilike.%${f.q}%`)
  if (f.risk && f.risk !== 'all') q = q.eq('risk_level', f.risk)
  if (f.cause) q = q.contains('risk_factors', causeFilter(f.cause))
  if (f.domain) q = q.eq('domain', f.domain)
  if (f.organization) q = q.eq('external_organization_id', f.organization)
  if (f.status === 'active') q = q.eq('account_enabled', true).neq('invitation_status', 'PendingAcceptance')
  if (f.status === 'disabled') q = q.eq('account_enabled', false)
  if (f.status === 'pending') q = q.eq('invitation_status', 'PendingAcceptance')
  if (f.activity === 'never') q = q.is('last_sign_in_at', null)
  if (f.activity === 'inactive90') q = q.or(`last_sign_in_at.is.null,last_sign_in_at.lt.${new Date(Date.now() - 90 * 86_400_000).toISOString()}`)
  if (f.activity === 'inactive180') q = q.or(`last_sign_in_at.is.null,last_sign_in_at.lt.${new Date(Date.now() - 180 * 86_400_000).toISOString()}`)
  if (f.sponsor === 'none') q = q.is('sponsor_ms_object_id', null)
  if (f.sponsor === 'disabled') q = q.eq('sponsor_enabled', false)
  if (f.review && f.review !== 'all') q = q.eq('review_status', f.review)
  if (f.action && f.action !== 'all') q = q.eq('recommended_action', f.action)
  switch (f.sort) {
    case 'name':
      q = q.order('display_name', { ascending: true })
      break
    case 'last_sign_in':
      q = q.order('last_sign_in_at', { ascending: true, nullsFirst: true })
      break
    case 'created':
      q = q.order('created_at_ms', { ascending: false })
      break
    default:
      q = q.order('risk_score', { ascending: false }).order('display_name', { ascending: true })
  }
  const { data, count, error } = await q.range((page - 1) * pageSize, page * pageSize - 1)
  if (error) throw error
  return { identities: ((data ?? []) as Guest[]).map(asExternalGuest), total: count ?? 0, page, pageSize }
}
