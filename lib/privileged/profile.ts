import type { AssignmentRecommendedChange, IdentityClass, IdentityOwnerKind, RecommendedAction, RiskFactor, RiskLevel } from '@/lib/types'
import { entraIdentityUrl, entraRoleDefinitionUrl } from '@/lib/privileged/links'
import {
  ASSIGNMENT_STATE_LABEL,
  assignmentState,
  holderIdentifier,
  mfaMethodLabel,
  nextPrivilegedReviewDueAt,
  privilegedClassLabel,
  type PrivilegedAssignmentRow,
  type PrivilegedIdentityRow,
  type PrivilegedRoleRow,
} from '@/lib/privileged/view'
import { DAILY_USE_DAYS, DORMANT_ADMIN_DAYS, daysSince, overlayRecommendedAction, recommendAssignmentChange } from '@/lib/risk/privileged'
import { levelFor } from '@/lib/risk/engine'

export const ASSIGNMENT_CHANGE_LABEL: Record<AssignmentRecommendedChange, string> = {
  convert_to_eligible: 'Convert to eligible',
  remove_assignment: 'Remove assignment',
  move_to_dedicated_admin: 'Move to dedicated admin',
  reduce_scope: 'Reduce scope',
}

export type PrivilegedActivation = {
  id: string
  roleName: string
  activatedAt: string
  durationMinutes: number | null
  result: string | null
  ticket: string | null
  approval: string | null
}

export type PrivilegedProfileAssignment = {
  id: string
  roleId: string
  roleName: string
  privilegeTier: 0 | 1 | 2 | null
  state: ReturnType<typeof assignmentState>
  stateLabel: string
  memberType: PrivilegedAssignmentRow['member_type']
  scopeLabel: string
  startsAt: string | null
  endsAt: string | null
  recommendedChange: AssignmentRecommendedChange | null
  entraUrl: string | null
}

export type PrivilegedProfileReview = {
  id: string
  name: string
  status: string
  decision: string | null
  dueAt: string | null
}

export type PrivilegedProfileRequest = {
  id: string
  actionType: string
  status: string
  createdAt: string
}

export type PrivilegedIdentityProfile = {
  identityId: string
  displayName: string | null
  identifier: string
  email: string | null
  identityClass: IdentityClass
  classLabel: string
  dedicatedAdmin: boolean
  privilegeTier: 0 | 1 | 2 | null
  riskScore: number
  riskLevel: RiskLevel
  recommendedAction: RecommendedAction
  status: string
  accountEnabled: boolean
  lastActivityAt: string | null
  lastReviewedAt: string | null
  firstSeenAt: string | null
  ownerDisplayName: string | null
  ownerKind: IdentityOwnerKind | null
  mfaLabel: string
  entraUrl: string | null
  pimAvailable: boolean
  nextPrivilegedReviewAt: string | null
  assignments: PrivilegedProfileAssignment[]
  activations: PrivilegedActivation[]
  factors: RiskFactor[]
  reviews: PrivilegedProfileReview[]
  requests: PrivilegedProfileRequest[]
  explanation: { explanation: string; created_at: string } | null
}

export function directoryScopeLabel(scopeId: string | null | undefined) {
  if (!scopeId || scopeId === '/') return 'Tenant'
  const au = scopeId.match(/administrativeUnits\/([^/?]+)/i)
  if (au?.[1]) return `Administrative unit · ${au[1]}`
  return scopeId
}

/** Drop activation justifications before anything is shown or sent to explain. */
export function publicActivation(
  row: Omit<PrivilegedActivation, 'approval'> & { justification?: string | null; approval?: string | null },
): PrivilegedActivation {
  return {
    id: row.id,
    roleName: row.roleName,
    activatedAt: row.activatedAt,
    durationMinutes: row.durationMinutes,
    result: row.result,
    ticket: row.ticket,
    approval: row.approval ?? null,
  }
}

export function parseStoredActivations(value: unknown): PrivilegedActivation[] {
  if (!Array.isArray(value)) return []
  const out: PrivilegedActivation[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (typeof row.id !== 'string' || typeof row.roleName !== 'string' || typeof row.activatedAt !== 'string') continue
    out.push(
      publicActivation({
        id: row.id,
        roleName: row.roleName,
        activatedAt: row.activatedAt,
        durationMinutes: typeof row.durationMinutes === 'number' ? row.durationMinutes : null,
        result: typeof row.result === 'string' ? row.result : null,
        ticket: typeof row.ticket === 'string' ? row.ticket : null,
        approval: typeof row.approval === 'string' ? row.approval : null,
        justification: typeof row.justification === 'string' ? row.justification : null,
      }),
    )
  }
  return out
}

export function buildPrivilegedProfile(input: {
  identity: PrivilegedIdentityRow & {
    recommended_action?: RecommendedAction | null
    owner_kind?: IdentityOwnerKind | null
    first_seen_at?: string | null
    ms_object_id?: string | null
  }
  assignments: PrivilegedAssignmentRow[]
  roles: PrivilegedRoleRow[]
  pimAvailable: boolean
  factors?: RiskFactor[]
  activations?: PrivilegedActivation[]
  reviews?: PrivilegedProfileReview[]
  requests?: PrivilegedProfileRequest[]
  explanation?: { explanation: string; created_at: string } | null
  now?: number
}): PrivilegedIdentityProfile {
  const now = input.now ?? Date.now()
  const identity = input.identity
  const roleById = new Map(input.roles.map((row) => [row.id, row]))
  const held = input.assignments.filter((row) => {
    const role = roleById.get(row.directory_role_id)
    return Boolean(role?.is_privileged)
  })
  const accountEnabled = identity.status !== 'disabled'
  const idle = daysSince(identity.last_activity_at, now)
  const dormant = identity.last_activity_at == null || (idle !== null && idle >= DORMANT_ADMIN_DAYS)
  const guest = identity.identity_class === 'external'
  const dailyUse = !identity.dedicated_admin && idle !== null && idle <= DAILY_USE_DAYS
  const assignments: PrivilegedProfileAssignment[] = held.map((row) => {
    const role = roleById.get(row.directory_role_id)
    const state = assignmentState(row, input.pimAvailable)
    const recommendedChange = recommendAssignmentChange(
      {
        id: row.id,
        assignmentType: row.assignment_type,
        memberType: row.member_type,
        privilegeTier: role?.privilege_tier ?? null,
        directoryScopeId: row.directory_scope_id,
        roleTemplateId: role?.template_id ?? null,
      },
      {
        hasP2: input.pimAvailable,
        accountEnabled,
        dormant,
        guest,
        dailyUse,
        dedicatedAdmin: Boolean(identity.dedicated_admin),
        assignmentCount: held.length,
      },
    )
    const templateId = role?.template_id ?? null
    return {
      id: row.id,
      roleId: row.directory_role_id,
      roleName: role?.display_name ?? 'Directory role',
      privilegeTier: role?.privilege_tier ?? null,
      state,
      stateLabel: input.pimAvailable ? ASSIGNMENT_STATE_LABEL[state] : 'Active',
      memberType: row.member_type,
      scopeLabel: directoryScopeLabel(row.directory_scope_id),
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      recommendedChange,
      entraUrl: templateId ? entraRoleDefinitionUrl(templateId) : null,
    }
  })

  const factors = input.factors ?? []
  const derivedScore = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0))
  const riskScore = factors.length > 0 ? derivedScore : identity.risk_score
  const riskLevel = factors.length > 0 ? levelFor(derivedScore) : identity.risk_level
  const storedAction = identity.recommended_action ?? null
  const recommendedAction = overlayRecommendedAction(riskLevel, storedAction ?? 'keep')

  return {
    identityId: identity.id,
    displayName: identity.display_name,
    identifier: holderIdentifier(identity),
    email: identity.primary_email,
    identityClass: identity.identity_class,
    classLabel: privilegedClassLabel(identity.identity_class, Boolean(identity.dedicated_admin)),
    dedicatedAdmin: Boolean(identity.dedicated_admin),
    privilegeTier: identity.privilege_tier,
    riskScore,
    riskLevel,
    recommendedAction,
    status: identity.status,
    accountEnabled,
    lastActivityAt: identity.last_activity_at,
    lastReviewedAt: identity.last_reviewed_at,
    firstSeenAt: identity.first_seen_at ?? null,
    ownerDisplayName: identity.owner_display_name ?? null,
    ownerKind: identity.owner_kind ?? null,
    mfaLabel: mfaMethodLabel(identity.identity_class, identity.auth_methods),
    entraUrl: identity.ms_object_id
      ? entraIdentityUrl({ objectId: identity.ms_object_id, identityClass: identity.identity_class })
      : null,
    pimAvailable: input.pimAvailable,
    nextPrivilegedReviewAt: nextPrivilegedReviewDueAt(identity.last_reviewed_at),
    assignments,
    activations: input.pimAvailable ? (input.activations ?? []).map((row) => publicActivation(row)) : [],
    factors,
    reviews: input.reviews ?? [],
    requests: input.requests ?? [],
    explanation: input.explanation ?? null,
  }
}
