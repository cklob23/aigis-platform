export type PriorMembership = {
  id: string
  guest_id: string
  resource_id: string
}

export type IncomingMembership = {
  guest_id?: unknown
  resource_id?: unknown
}

export function membershipKey(guestId: string, resourceId: string) {
  return `${guestId}:${resourceId}`
}

/**
 * Diff live memberships against prior rows. Caller must pass the full prior
 * set; a 1000-row page would mark still-real rows past that page as gone.
 */
export function planMembershipReconcile(prior: PriorMembership[], incoming: IncomingMembership[]) {
  const priorKeys = new Set(prior.map((row) => membershipKey(row.guest_id, row.resource_id)))
  const incomingKeys = new Set(
    incoming.map((row) => membershipKey(String(row.guest_id ?? ''), String(row.resource_id ?? ''))),
  )
  const removedIds = prior.filter((row) => !incomingKeys.has(membershipKey(row.guest_id, row.resource_id))).map((row) => row.id)
  const newCount = incoming.filter((row) => !priorKeys.has(membershipKey(String(row.guest_id ?? ''), String(row.resource_id ?? '')))).length
  return { priorKeys, incomingKeys, removedIds, newCount }
}

export type RiskMembership = {
  guest_id: string
  resource_id: string
  membership_type: string
}

export type RiskResource = {
  is_sensitive?: boolean | null
  resource_type?: string | null
}

/** Group memberships for rescore. Disabled guests past the first page still count. */
export function membershipsByGuestForRisk(
  memberships: RiskMembership[],
  resourceMap: Map<string, RiskResource>,
) {
  const byGuest = new Map<string, { isSensitive: boolean; isOwner: boolean; type: string }[]>()
  for (const row of memberships) {
    const resource = resourceMap.get(row.resource_id)
    if (!resource) continue
    const list = byGuest.get(row.guest_id) ?? []
    list.push({
      isSensitive: Boolean(resource.is_sensitive),
      isOwner: row.membership_type === 'owner',
      type: (resource.resource_type as string) ?? 'unknown',
    })
    byGuest.set(row.guest_id, list)
  }
  return byGuest
}
