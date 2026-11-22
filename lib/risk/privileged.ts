import type {
  AssignmentRecommendedChange,
  IdentityClass,
  IdentityOwnerKind,
  RecommendedAction,
  RiskFactor,
} from '@/lib/types'
import { TIER_0_TEMPLATE_IDS } from '@/lib/privileged/tiers'
import { authStrength, type AuthStrength } from '@/lib/risk/auth-methods'

const DAY = 86_400_000

export function daysSince(iso: string | null, now = Date.now()) {
  if (!iso) return null
  return Math.floor((now - new Date(iso).getTime()) / DAY)
}

/** True once the last review is more than PRIVILEGED_REVIEW_DAYS old. Null last review is not overdue here. */
export function privilegedReviewPastCadence(lastReviewedAt: string | null, now = Date.now()) {
  const age = daysSince(lastReviewedAt, now)
  return age !== null && age > PRIVILEGED_REVIEW_DAYS
}

export const GLOBAL_ADMIN_TEMPLATE_ID = TIER_0_TEMPLATE_IDS['Global Administrator']

export const OVERLAY_POINTS = {
  tier0_role: 25,
  tier1_role: 12,
  tier2_role: 4,
  permanent_tier0: 30,
  permanent_tier1: 12,
  guest_with_role: 25,
  sp_with_role: 15,
  dormant_admin: 20,
  eligible_not_activated: 10,
  no_strong_auth: 20,
  strong_auth_ok: 0,
  daily_use_admin: 8,
  too_many_global_admins: 6,
  role_via_unowned_group: 10,
  no_owner: 10,
  disabled_with_role: 15,
  privileged_review_overdue: 10,
  not_reviewed_flag: 10,
  active_tier0_unknown: 30,
} as const

export const ACTIVE_TIER0_UNKNOWN_LABEL =
  'Active Tier 0 assignment (P2 needed to tell permanent from eligible)'

export const DORMANT_ADMIN_DAYS = 90
/** Privileged access review cadence. Independent of tenant Review every (days). */
export const PRIVILEGED_REVIEW_DAYS = 90
export const DAILY_USE_DAYS = 7
export const GLOBAL_ADMIN_SOFT_CAP = 5

export type PrivilegedAssignmentInput = {
  id?: string
  assignmentType: 'active' | 'eligible'
  memberType: 'direct' | 'group' | 'inherited'
  privilegeTier: 0 | 1 | 2 | null
  directoryScopeId?: string | null
  roleTemplateId?: string | null
  roleName?: string | null
  groupOwned?: boolean | null
}

export type PrivilegedRiskContext = {
  isPrivileged: boolean
  identityClass: IdentityClass
  accountKind?: 'user' | 'guest' | 'sp' | 'workload' | 'agent' | string | null
  accountEnabled: boolean
  lastActivityAt: string | null
  createdAt?: string | null
  lastReviewedAt: string | null
  ownerKind?: IdentityOwnerKind | null
  ownerIdentityId?: string | null
  dedicatedAdmin?: boolean
  /** null = unknown (skip no_strong_auth / strong_auth_ok). */
  authMethods?: string[] | null
  authMethodsKnown: boolean
  hasP1: boolean
  hasP2: boolean
  globalAdminCount: number
  assignments: PrivilegedAssignmentInput[]
  /** Role names or template ids that this identity actually activated. */
  activatedRoleKeys?: string[]
  /** Guest sponsor. When false, skip overlay no_owner (no_sponsor already applies). */
  hasSponsor?: boolean
}

export type PrivilegedOverlayResult = {
  factors: RiskFactor[]
  score: number
  recommendedAction: RecommendedAction
  assignmentRecommendations: { assignmentId?: string; recommended_change: AssignmentRecommendedChange }[]
}

const STUB_OVERLAY: PrivilegedOverlayResult = {
  factors: [],
  score: 0,
  recommendedAction: 'keep',
  assignmentRecommendations: [],
}

function add(factors: RiskFactor[], key: keyof typeof OVERLAY_POINTS, label: string, detail?: string) {
  factors.push({ key, label, points: OVERLAY_POINTS[key], detail })
}

function heldTiers(assignments: PrivilegedAssignmentInput[]) {
  const held = new Set<0 | 1 | 2>()
  for (const row of assignments) {
    if (row.privilegeTier === 0 || row.privilegeTier === 1 || row.privilegeTier === 2) held.add(row.privilegeTier)
  }
  return held
}

function standingOfTier(assignments: PrivilegedAssignmentInput[], tier: 0 | 1) {
  return assignments.some((row) => row.assignmentType === 'active' && row.privilegeTier === tier)
}

function isGuestPrincipal(ctx: PrivilegedRiskContext) {
  return ctx.identityClass === 'external' || ctx.accountKind === 'guest'
}

function isSpPrincipal(ctx: PrivilegedRiskContext) {
  return ctx.identityClass === 'non_human' || ctx.accountKind === 'sp' || ctx.accountKind === 'workload'
}

function lastActivityDays(ctx: PrivilegedRiskContext, now: number) {
  return daysSince(ctx.lastActivityAt, now)
}

function isDormant(ctx: PrivilegedRiskContext, now: number) {
  if (!ctx.hasP1) return false
  const idle = lastActivityDays(ctx, now)
  return idle === null || idle >= DORMANT_ADMIN_DAYS
}

function isDailyUse(ctx: PrivilegedRiskContext, now: number) {
  const idle = lastActivityDays(ctx, now)
  if (idle === null) return false
  return idle <= DAILY_USE_DAYS && (standingOfTier(ctx.assignments, 0) || standingOfTier(ctx.assignments, 1))
}

/**
 * Privileged overlay factors. Skip P2-gated factors without PIM, skip dormant
 * without P1 sign-in activity, skip auth factors when methods are unknown.
 */
export function scorePrivilegedOverlay(
  ctx: PrivilegedRiskContext,
  now = Date.now(),
): PrivilegedOverlayResult {
  if (!ctx.isPrivileged) return STUB_OVERLAY

  const factors: RiskFactor[] = []
  const tiers = heldTiers(ctx.assignments)
  if (tiers.has(0)) add(factors, 'tier0_role', 'Holds a Tier 0 directory role')
  if (tiers.has(1)) add(factors, 'tier1_role', 'Holds a Tier 1 directory role')
  if (tiers.has(2)) add(factors, 'tier2_role', 'Holds a Tier 2 directory role')

  if (ctx.hasP2) {
    if (standingOfTier(ctx.assignments, 0)) add(factors, 'permanent_tier0', 'Standing (permanent) Tier 0 assignment')
    if (standingOfTier(ctx.assignments, 1)) add(factors, 'permanent_tier1', 'Standing (permanent) Tier 1 assignment')
  } else if (tiers.has(0)) {
    add(factors, 'active_tier0_unknown', ACTIVE_TIER0_UNKNOWN_LABEL)
  }

  if (isGuestPrincipal(ctx)) add(factors, 'guest_with_role', 'External identity with an admin role')
  if (isSpPrincipal(ctx)) add(factors, 'sp_with_role', 'Service principal holds a directory role')

  if (ctx.hasP1 && isDormant(ctx, now)) {
    const idle = lastActivityDays(ctx, now)
    add(
      factors,
      'dormant_admin',
      'Privileged identity inactive 90+ days',
      idle === null ? 'No sign-in activity recorded' : `Inactive ${idle} days`,
    )
  }

  if (ctx.hasP2) {
    const eligible = ctx.assignments.filter((row) => row.assignmentType === 'eligible' && row.privilegeTier != null)
    const activated = new Set((ctx.activatedRoleKeys ?? []).map((key) => key.toLowerCase()))
    const hasUnactivated = eligible.some((row) => {
      const currentlyActive = ctx.assignments.some(
        (other) =>
          other.assignmentType === 'active' &&
          other.privilegeTier === row.privilegeTier &&
          other.roleTemplateId === row.roleTemplateId,
      )
      if (currentlyActive) return false
      const keys = [row.roleTemplateId, row.roleName].filter((key): key is string => Boolean(key)).map((key) => key.toLowerCase())
      return !keys.some((key) => activated.has(key))
    })
    if (hasUnactivated) add(factors, 'eligible_not_activated', 'PIM-eligible but not activated')
  }

  if (ctx.authMethodsKnown) {
    const strength: AuthStrength = authStrength(ctx.authMethods ?? [])
    if (strength === 'strong') add(factors, 'strong_auth_ok', 'Strong authentication registered')
    else add(factors, 'no_strong_auth', 'No strong authentication registered')
  }

  const dailyUse = isDailyUse(ctx, now)
  if (dailyUse && !ctx.dedicatedAdmin) add(factors, 'daily_use_admin', 'Privileged account used for daily work')

  const holdsGa = ctx.assignments.some(
    (row) => (row.roleTemplateId ?? '').toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID.toLowerCase(),
  )
  if (holdsGa && ctx.globalAdminCount >= GLOBAL_ADMIN_SOFT_CAP) {
    add(factors, 'too_many_global_admins', 'Tenant has too many Global Administrators', `${ctx.globalAdminCount} Global Administrators`)
  }

  if (ctx.assignments.some((row) => row.memberType === 'group' && row.groupOwned === false)) {
    add(factors, 'role_via_unowned_group', 'Role assigned through an unowned group')
  }

  const hasOwner = Boolean(ctx.ownerIdentityId) || (ctx.ownerKind != null && ctx.ownerKind !== 'none')
  const guestMissingSponsor = isGuestPrincipal(ctx) && ctx.hasSponsor === false
  if (!hasOwner && !guestMissingSponsor) add(factors, 'no_owner', 'Privileged identity has no owner')

  if (!ctx.accountEnabled) add(factors, 'disabled_with_role', 'Disabled account still holds a directory role')

  const reviewAge = daysSince(ctx.lastReviewedAt, now)
  if (reviewAge === null) add(factors, 'not_reviewed_flag', 'Privileged identity never reviewed')
  else if (privilegedReviewPastCadence(ctx.lastReviewedAt, now)) {
    add(factors, 'privileged_review_overdue', 'Privileged access review overdue', `Last review ${reviewAge} days ago`)
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0)
  const score = Math.min(100, raw)
  const recommendedAction: RecommendedAction = score >= 25 ? 'review' : 'keep'
  const assignmentRecommendations: PrivilegedOverlayResult['assignmentRecommendations'] = []
  for (const row of ctx.assignments) {
    const change = recommendAssignmentChange(row, {
      hasP2: ctx.hasP2,
      accountEnabled: ctx.accountEnabled,
      dormant: isDormant(ctx, now),
      guest: isGuestPrincipal(ctx),
      dailyUse,
      dedicatedAdmin: ctx.dedicatedAdmin === true,
      assignmentCount: ctx.assignments.length,
    })
    if (change) assignmentRecommendations.push({ assignmentId: row.id, recommended_change: change })
  }

  return { factors, score, recommendedAction, assignmentRecommendations }
}

export function recommendAssignmentChange(
  assignment: PrivilegedAssignmentInput,
  ctx: {
    hasP2: boolean
    accountEnabled: boolean
    dormant: boolean
    guest: boolean
    dailyUse: boolean
    dedicatedAdmin: boolean
    assignmentCount: number
  },
): AssignmentRecommendedChange | null {
  const privilegedRole = assignment.privilegeTier === 0 || assignment.privilegeTier === 1 || assignment.privilegeTier === 2
  if (!privilegedRole) return null

  if (ctx.hasP2 && assignment.assignmentType === 'active' && (assignment.privilegeTier === 0 || assignment.privilegeTier === 1)) {
    return 'convert_to_eligible'
  }
  if (!ctx.accountEnabled || ctx.dormant || ctx.guest) return 'remove_assignment'
  if (ctx.dailyUse && !ctx.dedicatedAdmin && (assignment.privilegeTier === 0 || assignment.privilegeTier === 1)) {
    return 'move_to_dedicated_admin'
  }
  const isGlobalAdmin = (assignment.roleTemplateId ?? '').toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID.toLowerCase()
  if (isGlobalAdmin || assignment.assignmentType === 'eligible') return null
  if ((assignment.directoryScopeId ?? '/') === '/' && assignment.privilegeTier === 0 && ctx.assignmentCount > 1) {
    return 'reduce_scope'
  }
  return null
}

/** Overlay action is review at medium+ and never disable. */
export function overlayRecommendedAction(
  level: 'critical' | 'high' | 'medium' | 'low',
  base: RecommendedAction,
): RecommendedAction {
  if (level === 'medium' || level === 'high' || level === 'critical') return 'review'
  return base === 'disable' ? 'keep' : base
}
