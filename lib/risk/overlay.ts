import type { PrivilegeTier } from '@/lib/privileged/tiers'
import type { RecommendedAction, RiskFactor } from '@/lib/types'
import { daysSince, levelFor, type IdentityRiskResult, type RiskPolicyConfig } from '@/lib/risk/engine'

export type PrivilegeOverlayInput = {
  isPrivileged: boolean
  privilegeTier: PrivilegeTier | null
  standingPrivileged: boolean
  eligiblePrivileged: boolean
  groupPimOwner: boolean
  accountEnabled: boolean
  lastActivityAt: string | null
  firstSeenAt: string | null
  /** When false, skip inactivity factors (sign-in was not inventoried). */
  activityKnown: boolean
}

const STUB: IdentityRiskResult = { score: 0, level: 'low', factors: [], recommendedAction: 'keep' }

const TIER_POINTS: Record<PrivilegeTier, { key: string; label: string; points: number }> = {
  0: { key: 'privilege_t0', label: 'Tier 0 control-plane role', points: 40 },
  1: { key: 'privilege_t1', label: 'Tier 1 privileged role', points: 22 },
  2: { key: 'privilege_t2', label: 'Tier 2 privileged role', points: 10 },
}

/**
 * Privilege overlay on top of class scoring. Recommend/explain only: never
 * remove, never write Graph. Standing T0 is worse than eligible-only.
 */
export function computePrivilegeOverlay(
  input: PrivilegeOverlayInput,
  policy: RiskPolicyConfig,
  now = Date.now(),
): IdentityRiskResult {
  const hasOverlay =
    input.isPrivileged || input.standingPrivileged || input.eligiblePrivileged || input.groupPimOwner
  if (!hasOverlay) return STUB

  const factors: RiskFactor[] = []
  const add = (key: string, label: string, points: number, detail?: string) =>
    factors.push({ key, label, points, detail })

  if (input.isPrivileged && input.privilegeTier != null) {
    const tier = TIER_POINTS[input.privilegeTier]
    add(tier.key, tier.label, tier.points, `T${input.privilegeTier}`)
  }

  if (input.standingPrivileged) {
    add('standing_privileged', 'Standing privileged assignment', 16, 'Active directory role, not PIM-only')
  } else if (input.eligiblePrivileged) {
    add('eligible_privileged', 'PIM-eligible privileged role', 6, 'Eligible schedule, no standing assignment')
  }

  if (input.groupPimOwner) {
    add('group_pim_owner', 'PIM owner of a group', 8)
  }

  if (input.activityKnown) {
    const inactiveDays = daysSince(input.lastActivityAt, now)
    const ageDays = daysSince(input.firstSeenAt, now)
    if (!input.lastActivityAt) {
      add(
        'privileged_never_signed_in',
        'Privileged account never signed in',
        14,
        ageDays != null ? `Account is ${ageDays} days old` : undefined,
      )
    } else if (inactiveDays != null) {
      if (inactiveDays > policy.staleDays) {
        add('privileged_inactive_stale', `Privileged account inactive ${inactiveDays} days`, 24, `Threshold ${policy.staleDays} days`)
      } else if (inactiveDays > policy.inactiveDays) {
        add('privileged_inactive', `Privileged account inactive ${inactiveDays} days`, 12, `Threshold ${policy.inactiveDays} days`)
      }
    }
  }

  if (!input.accountEnabled) {
    add('privileged_disabled', 'Disabled account still holds privilege', 14)
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0)
  const score = Math.min(100, raw)
  const level = levelFor(score)

  let recommendedAction: RecommendedAction = 'keep'
  if (level === 'critical') recommendedAction = 'disable'
  else if (level === 'high' || level === 'medium') recommendedAction = 'review'

  return { score, level, factors, recommendedAction }
}

/** Concatenate overlay factors onto a base score. Overlay recommendation wins when it is stricter than keep. */
export function applyPrivilegeOverlay(base: IdentityRiskResult, overlay: IdentityRiskResult): IdentityRiskResult {
  if (overlay.factors.length === 0) return base
  const factors = [...base.factors, ...overlay.factors]
  const score = Math.min(100, factors.reduce((sum, f) => sum + f.points, 0))
  const level = levelFor(score)
  const recommendedAction =
    overlay.recommendedAction === 'keep' ? base.recommendedAction : overlay.recommendedAction
  return { score, level, factors, recommendedAction }
}
