import 'server-only'
import { db } from '@/lib/supabase/admin'
import { listAllIdentitiesUnpaged, listIdentities, type IdentityFilters } from '@/lib/data/identities'
import { privilegedPagesEnabled } from '@/lib/privileged/capability'
import { applyCombinedGuestDisplay } from '@/lib/privileged/score'
import { loadPrivilegedOverlayContexts, privilegedIdentityIdsAmong } from '@/lib/scan/privileged-risk'
import { causeCountsFromGuests, filterSortPageGuests, GUEST_EXPORT_PAGE_SIZE_CAP } from '@/lib/guests/display'
import type { ExternalOrganization, Guest, Identity, Membership, Resource, RiskLevel } from '@/lib/types'
import type { OwnerGuest } from '@/lib/identity/owner'
import { RISK_CAUSES, type RiskCauseKey } from '@/lib/risk/recommendation'

export type GuestFilters = IdentityFilters

/** jsonb containment on the stored factor list, e.g. risk_factors @> [{"key":"no_sponsor"}]. */
const causeFilter = (key: string) => JSON.stringify([{ key }])

async function guestsWithCombinedScores(tenantId: string, f: GuestFilters, settings: Record<string, unknown> | null | undefined) {
  const guests = await listAllIdentitiesUnpaged(tenantId, f)
  const privilegedIds = await privilegedIdentityIdsAmong(
    tenantId,
    guests.map((guest) => guest.identity_id).filter((id): id is string => Boolean(id)),
  )
  const overlayByIdentity = await loadPrivilegedOverlayContexts(tenantId, settings, privilegedIds)
  return guests.map((guest) => applyCombinedGuestDisplay(guest, overlayByIdentity.get(guest.identity_id) ?? null))
}

export async function listGuests(tenantId: string, f: GuestFilters, settings?: Record<string, unknown> | null) {
  if (!privilegedPagesEnabled(settings)) {
    const { identities, total, page, pageSize } = await listIdentities(tenantId, f)
    return { guests: identities, total, page, pageSize }
  }
  const scored = await guestsWithCombinedScores(tenantId, f, settings)
  return filterSortPageGuests(scored, f)
}

/** All matching guests after combined scoring. Used by CSV so export does not reload each page. */
export async function listMatchingGuests(tenantId: string, f: GuestFilters, settings?: Record<string, unknown> | null) {
  if (!privilegedPagesEnabled(settings)) {
    const guests = await listAllIdentitiesUnpaged(tenantId, f)
    return filterSortPageGuests(guests, { ...f, page: 1, pageSize: Math.max(guests.length, 1) }, GUEST_EXPORT_PAGE_SIZE_CAP).guests
  }
  const scored = await guestsWithCombinedScores(tenantId, f, settings)
  return filterSortPageGuests(scored, { ...f, page: 1, pageSize: Math.max(scored.length, 1) }, GUEST_EXPORT_PAGE_SIZE_CAP).guests
}

/** How many guests at a given risk level carry each groupable cause. Guests can appear in more than one group. */
export async function getCauseCounts(tenantId: string, risk: RiskLevel, settings?: Record<string, unknown> | null) {
  if (privilegedPagesEnabled(settings)) {
    const scored = await guestsWithCombinedScores(tenantId, {}, settings)
    return causeCountsFromGuests(scored, risk)
  }
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
  const [memberships, activity, history, reviews, remediations, domain, organization, identityRow, explanationRow] = await Promise.all([
    supabase.from('resource_memberships').select('*, resource:resources(*)').eq('tenant_id', tenantId).eq('guest_id', guestId).is('removed_at', null),
    supabase.from('guest_activity').select('*').eq('tenant_id', tenantId).eq('guest_id', guestId).order('occurred_at', { ascending: false }).limit(30),
    supabase.from('risk_scores').select('score,level,calculated_at').eq('tenant_id', tenantId).eq('guest_id', guestId).order('calculated_at', { ascending: true }).limit(30),
    supabase.from('review_items').select('*, review:access_reviews(id,name,status,due_at)').eq('tenant_id', tenantId).eq('guest_id', guestId).order('created_at', { ascending: false }),
    supabase.from('remediation_actions').select('*').eq('tenant_id', tenantId).eq('guest_id', guestId).order('created_at', { ascending: false }),
    guest.domain ? supabase.from('external_domains').select('*').eq('tenant_id', tenantId).eq('domain', guest.domain).maybeSingle() : Promise.resolve({ data: null }),
    guest.external_organization_id ? supabase.from('external_organizations').select('*').eq('tenant_id', tenantId).eq('id', guest.external_organization_id).maybeSingle() : Promise.resolve({ data: null }),
    guest.identity_id
      ? supabase.from('identities').select('*').eq('tenant_id', tenantId).eq('id', guest.identity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('recommendation_explanations')
      .select('id,explanation,recommended_action,citations,created_at')
      .eq('tenant_id', tenantId)
      .eq('guest_id', guestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const identity = (identityRow.data ?? null) as Identity | null
  let ownerGuest: OwnerGuest | null = null
  if (identity?.owner_identity_id) {
    const { data } = await supabase
      .from('identities')
      .select('id,display_name,primary_email,identity_class')
      .eq('tenant_id', tenantId)
      .eq('id', identity.owner_identity_id)
      .maybeSingle()
    ownerGuest = data
      ? {
          id: data.id as string,
          display_name: (data.display_name as string | null) ?? null,
          email: (data.primary_email as string | null) ?? null,
          identity_class: (data.identity_class as string | null) ?? null,
        }
      : null
  }
  return {
    organization: (organization.data ?? null) as ExternalOrganization | null,
    guest: guest as Guest,
    identity,
    ownerGuest,
    memberships: ((memberships.data ?? []) as (Membership & { resource: Resource })[]).sort((a, b) => Number(b.resource.is_sensitive) - Number(a.resource.is_sensitive)),
    activity: activity.data ?? [],
    history: history.data ?? [],
    reviews: reviews.data ?? [],
    remediations: remediations.data ?? [],
    domain: domain.data,
    explanation: explanationRow.error ? null : explanationRow.data,
  }
}

export async function getGuestsByIds(tenantId: string, ids: string[]) {
  if (ids.length === 0) return []
  const { data } = await db().from('guest_identities').select('*').eq('tenant_id', tenantId).in('id', ids)
  return (data ?? []) as Guest[]
}
