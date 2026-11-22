import type { IdentityClass, IdentityOwnerKind, RiskFactor, RiskLevel } from '@/lib/types'
import {
  GLOBAL_ADMIN_TEMPLATE_ID,
  scorePrivilegedOverlay,
  type PrivilegedAssignmentInput,
  type PrivilegedRiskContext,
} from '@/lib/risk/privileged'
import { scoreFromFactors } from '@/lib/risk/engine'

export type PrivilegedScoreIdentity = {
  id: string
  identity_class: IdentityClass
  is_privileged: boolean
  status: string
  last_reviewed_at: string | null
  last_activity_at: string | null
  owner_display_name?: string | null
  owner_kind?: IdentityOwnerKind | null
  owner_identity_id?: string | null
  dedicated_admin?: boolean
  auth_methods?: string[] | null
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
  opts: { pimAvailable: boolean; globalAdminCount: number },
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
          groupOwned: null,
        } satisfies PrivilegedAssignmentInput
      }),
  }
}

export function privilegedDisplayRisk(input: {
  identity: PrivilegedScoreIdentity
  assignments: PrivilegedScoreAssignment[]
  roles: PrivilegedScoreRole[]
  pimAvailable: boolean
  globalAdminCount: number
  now?: number
}): { factors: RiskFactor[]; score: number; level: RiskLevel } {
  const overlay = scorePrivilegedOverlay(
    privilegedOverlayContext(input.identity, input.assignments, input.roles, {
      pimAvailable: input.pimAvailable,
      globalAdminCount: input.globalAdminCount,
    }),
    input.now,
  )
  const derived = scoreFromFactors(overlay.factors)
  return { factors: overlay.factors, score: derived.score, level: derived.level }
}
