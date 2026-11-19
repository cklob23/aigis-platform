export type GuestGovernanceRef = {
  id: string
  identity_id?: string | null
}

/** Guest row or identity-only subject. Identity-only rows omit guest id. */
export type GovernanceSubjectRef = {
  id?: string | null
  guest_id?: string | null
  identity_id?: string | null
}

export type GovernanceIdMaps = {
  identityIdByGuestId: Map<string, string>
  accountIdByIdentityId: Map<string, string>
}

/** Fail closed: guest or identity-only rows must already have identity_id (0004). */
export function requireIdentityId(row: GovernanceSubjectRef): string {
  if (row.identity_id) return row.identity_id
  const label = row.id ?? row.guest_id ?? 'unknown'
  throw new Error(`fail closed: guest ${label} is missing identity_id; apply 0004 before dual-writing governance rows`)
}

export function identityIdForGuestId(guestId: string | null | undefined, maps: Pick<GovernanceIdMaps, 'identityIdByGuestId'>): string | null {
  if (!guestId) return null
  const identityId = maps.identityIdByGuestId.get(guestId)
  if (!identityId) {
    throw new Error(`fail closed: guest ${guestId} is missing identity_id; apply 0004 before dual-writing governance rows`)
  }
  return identityId
}

export function accountIdForIdentityId(identityId: string, maps: Pick<GovernanceIdMaps, 'accountIdByIdentityId'>): string {
  const accountId = maps.accountIdByIdentityId.get(identityId)
  if (!accountId) {
    throw new Error(`fail closed: identity ${identityId} is missing an entra account; apply 0004 before dual-writing memberships`)
  }
  return accountId
}

export function withIdentityId<T extends { guest_id?: string | null; identity_id?: string | null }>(
  row: T,
  maps: Pick<GovernanceIdMaps, 'identityIdByGuestId'>,
): T & { identity_id: string | null } {
  if (!row.guest_id) return { ...row, identity_id: row.identity_id ?? null }
  return { ...row, identity_id: identityIdForGuestId(row.guest_id, maps) }
}

export function withMembershipIds<T extends { guest_id: string }>(
  row: T,
  maps: GovernanceIdMaps,
): T & { identity_id: string; account_id: string } {
  const identity_id = identityIdForGuestId(row.guest_id, maps)
  if (!identity_id) {
    throw new Error(`fail closed: membership guest ${row.guest_id} is missing identity_id`)
  }
  return { ...row, identity_id, account_id: accountIdForIdentityId(identity_id, maps) }
}

export function mapsFromRows(input: {
  guests: GuestGovernanceRef[]
  accounts: { id: string; identity_id: string }[]
}): GovernanceIdMaps {
  return {
    identityIdByGuestId: new Map(input.guests.map((guest) => [guest.id, requireIdentityId(guest)])),
    accountIdByIdentityId: new Map(input.accounts.map((account) => [account.identity_id, account.id])),
  }
}
