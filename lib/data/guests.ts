import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { ExternalOrganization, Guest, Membership, Resource, RiskLevel } from '@/lib/types'
import { RISK_CAUSES, type RiskCauseKey } from '@/lib/risk/recommendation'

export type GuestFilters = {
  q?: string
  risk?: RiskLevel | 'all'
  domain?: string
  organization?: string
  status?: 'active' | 'disabled' | 'pending' | 'all'
  activity?: 'inactive90' | 'inactive180' | 'never' | 'all'
  sponsor?: 'none' | 'disabled' | 'all'
  review?: 'never_reviewed' | 'pending' | 'all'
  action?: string
  /** A risk-factor key; matches guests whose stored score breakdown contains that factor. */
  cause?: RiskCauseKey
  sort?: 'risk' | 'name' | 'last_sign_in' | 'created'
  page?: number
  pageSize?: number
}

/** jsonb containment on the stored factor list, e.g. risk_factors @> [{"key":"no_sponsor"}]. */
const causeFilter = (key: string) => JSON.stringify([{ key }])

export async function listGuests(tenantId: string, f: GuestFilters) {
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
  return { guests: (data ?? []) as Guest[], total: count ?? 0, page, pageSize }
}

/** How many guests at a given risk level carry each groupable cause. Guests can appear in more than one group. */
export async function getCauseCounts(tenantId: string, risk: RiskLevel) {
  const supabase = db()
  const counts = await Promise.all(
    RISK_CAUSES.map(async (c) => {
      const { count } = await supabase.from('guest_identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('removed_at', null).eq('risk_level', risk).contains('risk_factors', causeFilter(c.key))
      return [c.key, count ?? 0] as const
    }),
  )
  return Object.fromEntries(counts) as Record<RiskCauseKey, number>
}

export async function getGuestDomains(tenantId: string) {
  const { data } = await db().from('external_domains').select('domain,classification').eq('tenant_id', tenantId).order('domain')
  return data ?? []
}

export async function getGuestDetail(tenantId: string, guestId: string) {
  const supabase = db()
  const { data: guest } = await supabase.from('guest_identities').select('*').eq('tenant_id', tenantId).eq('id', guestId).maybeSingle()
  if (!guest) return null
  const [memberships, activity, history, reviews, remediations, domain, organization] = await Promise.all([
    supabase.from('resource_memberships').select('*, resource:resources(*)').eq('tenant_id', tenantId).eq('guest_id', guestId).is('removed_at', null),
    supabase.from('guest_activity').select('*').eq('tenant_id', tenantId).eq('guest_id', guestId).order('occurred_at', { ascending: false }).limit(30),
    supabase.from('risk_scores').select('score,level,calculated_at').eq('tenant_id', tenantId).eq('guest_id', guestId).order('calculated_at', { ascending: true }).limit(30),
    supabase.from('review_items').select('*, review:access_reviews(id,name,status,due_at)').eq('tenant_id', tenantId).eq('guest_id', guestId).order('created_at', { ascending: false }),
    supabase.from('remediation_actions').select('*').eq('tenant_id', tenantId).eq('guest_id', guestId).order('created_at', { ascending: false }),
    guest.domain ? supabase.from('external_domains').select('*').eq('tenant_id', tenantId).eq('domain', guest.domain).maybeSingle() : Promise.resolve({ data: null }),
    guest.external_organization_id ? supabase.from('external_organizations').select('*').eq('tenant_id', tenantId).eq('id', guest.external_organization_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  return {
    organization: (organization.data ?? null) as ExternalOrganization | null,
    guest: guest as Guest,
    memberships: ((memberships.data ?? []) as (Membership & { resource: Resource })[]).sort((a, b) => Number(b.resource.is_sensitive) - Number(a.resource.is_sensitive)),
    activity: activity.data ?? [],
    history: history.data ?? [],
    reviews: reviews.data ?? [],
    remediations: remediations.data ?? [],
    domain: domain.data,
  }
}

export async function getGuestsByIds(tenantId: string, ids: string[]) {
  if (ids.length === 0) return []
  const { data } = await db().from('guest_identities').select('*').eq('tenant_id', tenantId).in('id', ids)
  return (data ?? []) as Guest[]
}
