import { hubRowsFromGuest } from '@/lib/identity/provision'
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

type IdentityScanRow = Omit<
  ReturnType<typeof hubRowsFromGuest>['identity'],
  'risk_score' | 'risk_level' | 'recommended_action' | 'review_status' | 'last_reviewed_at' | 'first_seen_at'
>
type AccountScanRow = ReturnType<typeof hubRowsFromGuest>['account'] & {
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

export function asExternalGuest(row: Guest): Guest {
  if (!row.identity_id) {
    throw new Error(`fail closed: guest ${row.id} is missing identity_id`)
  }
  return row
}

/**
 * Plan a dual-write of identities, entra accounts, optional sponsor relations,
 * and guest_identities (still keyed by guest_id / ms_object_id).
 * Does not mint human_internal stub identities. The 0004 insert trigger is left
 * in place as a safety net; this planner always sets identity_id so the trigger no-ops.
 */
export function planGuestInventory(input: {
  tenantId: string
  now: string
  incoming: IncomingExternalGuest[]
  existing: ExistingExternalGuest[]
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
  const relations: SponsorRelationRow[] = []
  for (const guest of guests) {
    if (!guest.sponsor_ms_object_id) continue
    const toId = oidToIdentityId.get(guest.sponsor_ms_object_id)
    if (!toId || toId === guest.identity_id) continue
    relations.push({
      tenant_id: input.tenantId,
      from_identity_id: guest.identity_id,
      to_identity_id: toId,
      relation_type: 'sponsors',
    })
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
