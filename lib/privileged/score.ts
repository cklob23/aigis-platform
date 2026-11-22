import type { DomainClassification, Guest, IdentityClass, IdentityOwnerKind, RiskFactor, RiskLevel } from '@/lib/types'
import {
  GLOBAL_ADMIN_TEMPLATE_ID,
  OVERLAY_POINTS,
  scorePrivilegedOverlay,
  type PrivilegedAssignmentInput,
  type PrivilegedRiskContext,
} from '@/lib/risk/privileged'
import { computeIdentityRisk, DEFAULT_RISK_POLICY, dropOwnerWhenSponsorMissing, scoreFromFactors, type RiskInput } from '@/lib/risk/engine'

const OVERLAY_FACTOR_KEYS = new Set(Object.keys(OVERLAY_POINTS))

export type PrivilegedGuestRisk = {
  invitationStatus: string | null
  createdAt: string | null
  lastSignInAt: string | null
  lastNonInteractiveSignInAt?: string | null
  hasSponsor: boolean
  sponsorEnabled: boolean | null
  domainClassification: DomainClassification
  memberships: RiskInput['memberships']
}

export type PrivilegedScoreIdentity = {
  id: string
  identity_class: IdentityClass
  is_privileged: boolean
  status: string
  last_reviewed_at: string | null
  last_activity_at: string | null
  first_seen_at?: string | null
  owner_display_name?: string | null
  owner_kind?: IdentityOwnerKind | null
  owner_identity_id?: string | null
  dedicated_admin?: boolean
  auth_methods?: string[] | null
  activatedRoleKeys?: string[]
  guestRisk?: PrivilegedGuestRisk | null
  storedGuestFactors?: RiskFactor[] | null
}

export type PrivilegedScoreAssignment = {
  id: string
  principal_identity_id: string | null
  assignment_type: 'active' | 'eligible'
  member_type: 'direct' | 'group' | 'inherited'
  directory_scope_id: string
  directory_role_id: string
}

export type PrivilegedScoreRole = {
  id: string
  privilege_tier: 0 | 1 | 2 | null
  template_id?: string | null
  display_name?: string | null
}

function accountKind(identityClass: IdentityClass) {
  if (identityClass === 'external') return 'guest'
  if (identityClass === 'non_human') return 'sp'
  return 'user'
}

export function countGlobalAdmins(assignments: PrivilegedScoreAssignment[], roles: PrivilegedScoreRole[]) {
  const gaRoleIds = new Set(
    roles
      .filter((role) => (role.template_id ?? '').toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID.toLowerCase())
      .map((role) => role.id),
  )
  return new Set(
    assignments
      .filter((row) => gaRoleIds.has(row.directory_role_id) && row.principal_identity_id)
      .map((row) => row.principal_identity_id as string),
  ).size
}

export function privilegedOverlayContext(
  identity: PrivilegedScoreIdentity,
  assignments: PrivilegedScoreAssignment[],
  roles: PrivilegedScoreRole[],
  opts: { pimAvailable: boolean; globalAdminCount: number; activatedRoleKeys?: string[] },
): PrivilegedRiskContext {
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const methods = identity.auth_methods
  const ownerKind: IdentityOwnerKind | null =
    identity.owner_kind ?? (identity.owner_display_name ? 'assigned' : 'none')
  return {
    isPrivileged: identity.is_privileged,
    identityClass: identity.identity_class,
    accountKind: accountKind(identity.identity_class),
    accountEnabled: identity.status !== 'disabled',
    lastActivityAt: identity.last_activity_at,
    lastReviewedAt: identity.last_reviewed_at,
    ownerKind,
    ownerIdentityId: identity.owner_identity_id ?? null,
    dedicatedAdmin: Boolean(identity.dedicated_admin),
    authMethods: methods ?? null,
    authMethodsKnown: methods != null,
    hasP1: true,
    hasP2: opts.pimAvailable,
    globalAdminCount: opts.globalAdminCount,
    activatedRoleKeys: opts.activatedRoleKeys ?? identity.activatedRoleKeys ?? [],
    hasSponsor: identity.guestRisk?.hasSponsor,
    assignments: assignments
      .filter((row) => row.principal_identity_id === identity.id)
      .map((row) => {
        const role = roleById.get(row.directory_role_id)
        return {
          id: row.id,
          assignmentType: row.assignment_type,
          memberType: row.member_type,
          privilegeTier: role?.privilege_tier ?? null,
          directoryScopeId: row.directory_scope_id,
          roleTemplateId: role?.template_id ?? null,
          roleName: role?.display_name ?? null,
          groupOwned: null,
        } satisfies PrivilegedAssignmentInput
      }),
  }
}

function riskInputForIdentity(identity: PrivilegedScoreIdentity, privileged: PrivilegedRiskContext): RiskInput {
  const guest = identity.guestRisk
  const hasOwner = Boolean(identity.owner_identity_id) || (identity.owner_kind != null && identity.owner_kind !== 'none') || Boolean(identity.owner_display_name)
  return {
    accountEnabled: identity.status !== 'disabled',
    invitationStatus: guest?.invitationStatus ?? null,
    createdAt: guest?.createdAt ?? identity.first_seen_at ?? null,
    lastSignInAt: guest?.lastSignInAt ?? identity.last_activity_at,
    lastNonInteractiveSignInAt: guest?.lastNonInteractiveSignInAt ?? null,
    authMethods: identity.auth_methods ?? [],
    hasSponsor: guest?.hasSponsor ?? hasOwner,
    sponsorEnabled: guest?.sponsorEnabled ?? true,
    domainClassification: guest?.domainClassification ?? 'vendor',
    lastReviewedAt: identity.last_reviewed_at,
    memberships: guest?.memberships ?? [],
    privileged,
  }
}

export function privilegedDisplayRisk(input: {
  identity: PrivilegedScoreIdentity
  assignments: PrivilegedScoreAssignment[]
  roles: PrivilegedScoreRole[]
  pimAvailable: boolean
  globalAdminCount: number
  activatedRoleKeys?: string[]
  now?: number
}): { factors: RiskFactor[]; score: number; level: RiskLevel } {
  const overlay = privilegedOverlayContext(input.identity, input.assignments, input.roles, {
    pimAvailable: input.pimAvailable,
    globalAdminCount: input.globalAdminCount,
    activatedRoleKeys: input.activatedRoleKeys,
  })
  if (input.identity.identity_class === 'external' && (input.identity.storedGuestFactors?.length ?? 0) > 0) {
    return combineStoredGuestFactors(input.identity.storedGuestFactors ?? [], overlay, input.now)
  }
  const risk = computeIdentityRisk(input.identity.identity_class, riskInputForIdentity(input.identity, overlay), DEFAULT_RISK_POLICY, input.now)
  const derived = scoreFromFactors(risk.factors)
  return { factors: risk.factors, score: derived.score, level: derived.level }
}

function combineStoredGuestFactors(
  stored: RiskFactor[],
  overlay: PrivilegedRiskContext,
  now?: number,
): { factors: RiskFactor[]; score: number; level: RiskLevel } {
  const base = stored.filter((factor) => !OVERLAY_FACTOR_KEYS.has(factor.key))
  const overlayFactors = overlay.isPrivileged ? scorePrivilegedOverlay(overlay, now).factors : []
  const factors = dropOwnerWhenSponsorMissing([...base, ...overlayFactors])
  const derived = scoreFromFactors(factors)
  return { factors, score: derived.score, level: derived.level }
}

/** Display-only: keep stored guest-only factors, then add the live privileged overlay. Unprivileged guests are unchanged. */
export function applyCombinedGuestDisplay(guest: Guest, overlay: PrivilegedRiskContext | null | undefined, now?: number): Guest {
  if (!overlay?.isPrivileged) return guest
  const combined = combineStoredGuestFactors(guest.risk_factors ?? [], overlay, now)
  return {
    ...guest,
    risk_factors: combined.factors,
    risk_score: combined.score,
    risk_level: combined.level,
  }
}

export function guestRiskFromGuest(
  guest: Pick<
    Guest,
    | 'invitation_status'
    | 'created_at_ms'
    | 'last_sign_in_at'
    | 'last_non_interactive_sign_in_at'
    | 'sponsor_ms_object_id'
    | 'sponsor_display_name'
    | 'sponsor_email'
    | 'sponsor_enabled'
  >,
  domainClassification: DomainClassification = 'vendor',
  memberships: RiskInput['memberships'] = [],
): PrivilegedGuestRisk {
  return {
    invitationStatus: guest.invitation_status,
    createdAt: guest.created_at_ms,
    lastSignInAt: guest.last_sign_in_at,
    lastNonInteractiveSignInAt: guest.last_non_interactive_sign_in_at,
    hasSponsor: Boolean(guest.sponsor_ms_object_id || guest.sponsor_display_name || guest.sponsor_email),
    sponsorEnabled: guest.sponsor_enabled,
    domainClassification,
    memberships,
  }
}
