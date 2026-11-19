import type { IdentityAccountKind, IdentityClass, IdentityOwnerKind, IdentityStatus } from '@/lib/types'

/**
 * Build hub + entra account rows for an external guest.
 * Does not create sponsor stub identities or identity_relations.
 */
export type GuestHubSource = {
  id: string
  tenant_id: string
  ms_object_id: string
  display_name: string | null
  email: string | null
  upn: string | null
  account_enabled: boolean
  identity_class?: string
  sponsor_ms_object_id: string | null
  sponsor_display_name: string | null
  sponsor_email: string | null
  review_status?: string
  last_reviewed_at?: string | null
  last_sign_in_at: string | null
  last_non_interactive_sign_in_at?: string | null
  first_seen_at?: string
  last_seen_at: string
  removed_at?: string | null
  risk_score?: number
  risk_level?: string
  recommended_action?: string
}

export function ownerKindFromSponsor(
  sponsorMsObjectId: string | null | undefined,
  sponsorEmail: string | null | undefined,
): IdentityOwnerKind {
  if ((sponsorMsObjectId && sponsorMsObjectId.length > 0) || (sponsorEmail && sponsorEmail.length > 0)) return 'sponsor'
  return 'none'
}

export function identityStatusFromGuest(accountEnabled: boolean, removedAt: string | null | undefined): IdentityStatus {
  if (removedAt) return 'removed'
  return accountEnabled ? 'active' : 'disabled'
}

export type InternalUserHubSource = {
  id: string
  tenant_id: string
  ms_object_id: string
  display_name: string | null
  email: string | null
  upn: string | null
  account_enabled: boolean
  last_activity_at?: string | null
  last_seen_at: string
  removed_at?: string | null
  on_premises_sync_enabled?: boolean | null
  assigned_plans?: { servicePlanId?: string; service?: string; capabilityStatus?: string }[]
  dedicated_admin?: boolean
  inventory_reasons?: string[]
}

const ADMIN_NAME_RE = /(?:^|[^a-z0-9])admin(?:[^a-z0-9]|$)|(?:^|[._-])adm(?:[._-]|$)/i

/**
 * Dedicated admin: holds a directory role, is cloud-only (not on-prem synced),
 * and either looks like an admin account or has no enabled assigned plans.
 */
export function isDedicatedAdminAccount(input: {
  holdsDirectoryRole: boolean
  onPremisesSyncEnabled?: boolean | null
  displayName?: string | null
  userPrincipalName?: string | null
  assignedPlans?: { capabilityStatus?: string }[] | null
}): boolean {
  if (!input.holdsDirectoryRole) return false
  if (input.onPremisesSyncEnabled === true) return false
  const hay = `${input.displayName ?? ''} ${input.userPrincipalName ?? ''}`
  if (ADMIN_NAME_RE.test(hay)) return true
  const plans = input.assignedPlans ?? []
  return !plans.some((plan) => plan.capabilityStatus === 'Enabled')
}

export function hubRowsFromUser(user: InternalUserHubSource) {
  return {
    identity: {
      id: user.id,
      tenant_id: user.tenant_id,
      identity_class: 'human_internal' as IdentityClass,
      display_name: user.display_name,
      primary_email: user.email,
      status: identityStatusFromGuest(user.account_enabled, user.removed_at),
      risk_score: 0,
      risk_level: 'low' as const,
      recommended_action: 'keep' as const,
      review_status: 'never_reviewed' as const,
      last_reviewed_at: null as string | null,
      owner_identity_id: null as string | null,
      owner_kind: 'none' as IdentityOwnerKind,
      owner_email: null as string | null,
      owner_ms_object_id: null as string | null,
      owner_display_name: null as string | null,
      last_activity_at: user.last_activity_at ?? null,
      first_seen_at: user.last_seen_at,
      last_seen_at: user.last_seen_at,
      removed_at: user.removed_at ?? null,
    },
    account: {
      identity_id: user.id,
      tenant_id: user.tenant_id,
      source: 'entra' as const,
      source_object_id: user.ms_object_id,
      account_kind: 'user' as IdentityAccountKind,
      upn: user.upn,
      enabled: user.account_enabled,
      last_activity_at: user.last_activity_at ?? null,
      attrs: {
        onPremisesSyncEnabled: user.on_premises_sync_enabled ?? null,
        assignedPlans: user.assigned_plans ?? [],
        dedicatedAdmin: user.dedicated_admin === true,
        inventoryReasons: user.inventory_reasons ?? [],
      },
    },
  }
}

export function hubRowsFromGuest(guest: GuestHubSource) {
  const owner_kind = ownerKindFromSponsor(guest.sponsor_ms_object_id, guest.sponsor_email)
  return {
    identity: {
      id: guest.id,
      tenant_id: guest.tenant_id,
      identity_class: guest.identity_class ?? 'external',
      display_name: guest.display_name,
      primary_email: guest.email,
      status: identityStatusFromGuest(guest.account_enabled, guest.removed_at),
      risk_score: guest.risk_score ?? 0,
      risk_level: guest.risk_level ?? 'low',
      recommended_action: guest.recommended_action ?? 'keep',
      review_status: guest.review_status ?? 'never_reviewed',
      last_reviewed_at: guest.last_reviewed_at ?? null,
      owner_identity_id: null as string | null,
      owner_kind,
      owner_email: guest.sponsor_email,
      owner_ms_object_id: guest.sponsor_ms_object_id,
      owner_display_name: guest.sponsor_display_name,
      last_activity_at: guest.last_sign_in_at ?? guest.last_non_interactive_sign_in_at ?? null,
      first_seen_at: guest.first_seen_at ?? guest.last_seen_at,
      last_seen_at: guest.last_seen_at,
      removed_at: guest.removed_at ?? null,
    },
    account: {
      identity_id: guest.id,
      tenant_id: guest.tenant_id,
      source: 'entra' as const,
      source_object_id: guest.ms_object_id,
      account_kind: 'guest' as IdentityAccountKind,
      upn: guest.upn,
      enabled: guest.account_enabled,
      last_activity_at: guest.last_sign_in_at ?? guest.last_non_interactive_sign_in_at ?? null,
    },
  }
}
