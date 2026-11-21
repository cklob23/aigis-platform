import { hubRowsFromGuest, hubRowsFromUser, isDedicatedAdminAccount, type InternalUserHubSource } from '@/lib/identity/provision'
import type { Guest } from '@/lib/types'

export type ExistingExternalGuest = {
  id: string
  ms_object_id: string
  identity_id: string | null
  removed_at: string | null
}

export type IncomingExternalGuest = {
  ms_object_id: string
  display_name: string | null
  email: string | null
  upn: string | null
  domain: string | null
  external_domain_id: string | null
  external_organization_id: string | null
  identity_class: 'external'
  external_type: string
  classification_evidence: unknown
  company_name: string | null
  company_source: 'graph' | 'domain' | null
  account_enabled: boolean
  invitation_status: string | null
  user_type: string
  created_at_ms: string | null
  last_sign_in_at: string | null
  last_non_interactive_sign_in_at: string | null
  sponsor_ms_object_id: string | null
  sponsor_display_name: string | null
  sponsor_email: string | null
  sponsor_enabled: boolean | null
}

export type GuestRow = IncomingExternalGuest & {
  id: string
  tenant_id: string
  identity_id: string
  last_seen_at: string
  removed_at: string | null
}

export type SponsorRelationRow = {
  tenant_id: string
  from_identity_id: string
  to_identity_id: string
  relation_type: 'sponsors'
}

export type InventoriedInternal = {
  ms_object_id: string
  identity_id: string
  email?: string | null
  upn?: string | null
}

type IdentityScanRow = Omit<
  ReturnType<typeof hubRowsFromGuest>['identity'],
  'risk_score' | 'risk_level' | 'recommended_action' | 'risk_factors' | 'review_status' | 'last_reviewed_at' | 'first_seen_at'
>
type AccountScanRow = ReturnType<typeof hubRowsFromGuest>['account'] & {
  last_seen_at: string
  removed_at: string | null
}

type InternalAccountScanRow = ReturnType<typeof hubRowsFromUser>['account'] & {
  last_seen_at: string
  removed_at: string | null
}

export type GuestInventoryPlan = {
  tenantId: string
  now: string
  guests: GuestRow[]
  identities: IdentityScanRow[]
  accounts: AccountScanRow[]
  relations: SponsorRelationRow[]
  removedGuestIds: string[]
  removedIdentityIds: string[]
  newCount: number
}

function normalizeAddr(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

function resolveSponsorIdentityId(
  guest: Pick<IncomingExternalGuest, 'sponsor_ms_object_id' | 'sponsor_email'>,
  oidToIdentityId: Map<string, string>,
  addrToIdentityId: Map<string, string>,
): string | undefined {
  if (guest.sponsor_ms_object_id) {
    const byOid = oidToIdentityId.get(guest.sponsor_ms_object_id)
    if (byOid) return byOid
  }
  const addr = normalizeAddr(guest.sponsor_email)
  if (!addr) return undefined
  return addrToIdentityId.get(addr)
}

export function asExternalGuest(row: Guest): Guest {
  if (!row.identity_id) {
    throw new Error(`fail closed: guest ${row.id} is missing identity_id`)
  }
  return row
}

/**
 * Plan a dual-write of identities, entra accounts, optional sponsor relations,
 * and guest_identities (still keyed by guest_id / ms_object_id).
 * Resolves sponsors against guests in this plan and inventoried human_internal
 * rows. Does not mint stub identities. The 0004 insert trigger is left in place
 * as a safety net; this planner always sets identity_id so the trigger no-ops.
 */
export function planGuestInventory(input: {
  tenantId: string
  now: string
  incoming: IncomingExternalGuest[]
  existing: ExistingExternalGuest[]
  internals?: InventoriedInternal[]
  generateId?: () => string
}): GuestInventoryPlan {
  const generateId = input.generateId ?? (() => crypto.randomUUID())
  const existingByMs = new Map(input.existing.map((row) => [row.ms_object_id, row]))
  const incomingIds = new Set(input.incoming.map((row) => row.ms_object_id))

  const guests: GuestRow[] = []
  let newCount = 0
  for (const row of input.incoming) {
    const existing = existingByMs.get(row.ms_object_id)
    if (existing && !existing.identity_id) {
      throw new Error(`fail closed: guest ${existing.id} (${row.ms_object_id}) is missing identity_id; apply 0004 before scanning`)
    }
    const id = existing?.id ?? generateId()
    const identity_id = existing?.identity_id ?? id
    if (!existing) newCount++
    guests.push({
      ...row,
      id,
      tenant_id: input.tenantId,
      identity_id,
      last_seen_at: input.now,
      removed_at: null,
    })
  }

  const removed = input.existing.filter((row) => !row.removed_at && !incomingIds.has(row.ms_object_id))
  for (const row of removed) {
    if (!row.identity_id) {
      throw new Error(`fail closed: guest ${row.id} (${row.ms_object_id}) is missing identity_id; apply 0004 before scanning`)
    }
  }

  const identities = guests.map((guest) => {
    const { risk_score: _s, risk_level: _l, recommended_action: _a, review_status: _r, last_reviewed_at: _lr, first_seen_at: _fs, ...identity } = hubRowsFromGuest({
      ...guest,
      id: guest.identity_id,
    }).identity
    return identity
  })
  const accounts = guests.map((guest) => ({
    ...hubRowsFromGuest({ ...guest, id: guest.identity_id }).account,
    last_seen_at: input.now,
    removed_at: null,
  }))

  const oidToIdentityId = new Map(guests.map((guest) => [guest.ms_object_id, guest.identity_id]))
  const addrToIdentityId = new Map<string, string>()
  const ambiguousAddrs = new Set<string>()
  for (const row of input.internals ?? []) {
    if (!row.ms_object_id || !row.identity_id) continue
    if (!oidToIdentityId.has(row.ms_object_id)) oidToIdentityId.set(row.ms_object_id, row.identity_id)
    for (const addr of [normalizeAddr(row.email), normalizeAddr(row.upn)]) {
      if (!addr || ambiguousAddrs.has(addr)) continue
      const existing = addrToIdentityId.get(addr)
      if (!existing) addrToIdentityId.set(addr, row.identity_id)
      else if (existing !== row.identity_id) {
        addrToIdentityId.delete(addr)
        ambiguousAddrs.add(addr)
      }
    }
  }
  const relations: SponsorRelationRow[] = []
  for (const guest of guests) {
    const toId = resolveSponsorIdentityId(guest, oidToIdentityId, addrToIdentityId)
    if (!toId || toId === guest.identity_id) continue
    relations.push({
      tenant_id: input.tenantId,
      from_identity_id: guest.identity_id,
      to_identity_id: toId,
      relation_type: 'sponsors',
    })
  }

  const ownerByFrom = new Map(relations.map((rel) => [rel.from_identity_id, rel.to_identity_id]))
  for (const identity of identities) {
    identity.owner_identity_id = ownerByFrom.get(identity.id) ?? null
  }

  return {
    tenantId: input.tenantId,
    now: input.now,
    guests,
    identities,
    accounts,
    relations,
    removedGuestIds: removed.map((row) => row.id),
    removedIdentityIds: removed.map((row) => row.identity_id as string),
    newCount,
  }
}

export type ExistingInternalAccount = {
  identity_id: string
  ms_object_id: string
  removed_at: string | null
}

export type IncomingInternalUser = {
  ms_object_id: string
  display_name: string | null
  email: string | null
  upn: string | null
  account_enabled: boolean
  user_type?: string | null
  on_premises_sync_enabled?: boolean | null
  assigned_plans?: { servicePlanId?: string; service?: string; capabilityStatus?: string }[]
  is_role_holder?: boolean
  is_sponsor?: boolean
  is_manager?: boolean
}

export type InternalInventoryPlan = {
  tenantId: string
  now: string
  identities: IdentityScanRow[]
  accounts: InternalAccountScanRow[]
  removedIdentityIds: string[]
}

function inventoryReasons(row: IncomingInternalUser): string[] {
  const reasons: string[] = []
  if (row.is_role_holder) reasons.push('role_holder')
  if (row.is_sponsor) reasons.push('sponsor')
  if (row.is_manager) reasons.push('manager')
  return reasons
}

/**
 * Scoped human_internal inventory: role holders, guest sponsors, and
 * role-holder managers. Skips guests. Does not invent stub identities.
 */
export function planInternalInventory(input: {
  tenantId: string
  now: string
  incoming: IncomingInternalUser[]
  existing: ExistingInternalAccount[]
  generateId?: () => string
}): InternalInventoryPlan {
  const generateId = input.generateId ?? (() => crypto.randomUUID())
  const existingByMs = new Map(input.existing.map((row) => [row.ms_object_id, row]))
  const incomingIds = new Set<string>()
  const identities: IdentityScanRow[] = []
  const accounts: InternalAccountScanRow[] = []

  for (const row of input.incoming) {
    if (!row.ms_object_id) continue
    if ((row.user_type ?? 'Member') === 'Guest') continue
    incomingIds.add(row.ms_object_id)
    const existing = existingByMs.get(row.ms_object_id)
    const id = existing?.identity_id ?? generateId()
    const reasons = inventoryReasons(row)
    const dedicated_admin = isDedicatedAdminAccount({
      holdsDirectoryRole: row.is_role_holder === true,
      onPremisesSyncEnabled: row.on_premises_sync_enabled,
      displayName: row.display_name,
      userPrincipalName: row.upn,
      assignedPlans: row.assigned_plans,
    })
    const source: InternalUserHubSource = {
      id,
      tenant_id: input.tenantId,
      ms_object_id: row.ms_object_id,
      display_name: row.display_name,
      email: row.email,
      upn: row.upn,
      account_enabled: row.account_enabled,
      last_seen_at: input.now,
      removed_at: null,
      on_premises_sync_enabled: row.on_premises_sync_enabled ?? null,
      assigned_plans: row.assigned_plans ?? [],
      dedicated_admin,
      inventory_reasons: reasons,
    }
    const { risk_score: _s, risk_level: _l, recommended_action: _a, review_status: _r, last_reviewed_at: _lr, first_seen_at: _fs, ...identity } =
      hubRowsFromUser(source).identity
    identities.push(identity)
    accounts.push({
      ...hubRowsFromUser(source).account,
      last_seen_at: input.now,
      removed_at: null,
    })
  }

  const removedIdentityIds = input.existing
    .filter((row) => !row.removed_at && !incomingIds.has(row.ms_object_id))
    .map((row) => row.identity_id)

  return {
    tenantId: input.tenantId,
    now: input.now,
    identities,
    accounts,
    removedIdentityIds,
  }
}
