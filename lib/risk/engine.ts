import type { DomainClassification, IdentityClass, RecommendedAction, RiskFactor, RiskLevel } from '@/lib/types'
import { overlayRecommendedAction, scorePrivilegedOverlay, type PrivilegedRiskContext } from '@/lib/risk/privileged'

export type RiskInput = {
  accountEnabled: boolean
  invitationStatus: string | null
  createdAt: string | null
  lastSignInAt: string | null
  lastNonInteractiveSignInAt?: string | null
  authMethods: string[]
  hasSponsor: boolean
  sponsorEnabled: boolean | null
  domainClassification: DomainClassification
  lastReviewedAt: string | null
  memberships: { isSensitive: boolean; isOwner: boolean; type: string }[]
  privileged?: PrivilegedRiskContext | null
}

export type RiskPolicyConfig = {
  inactiveDays: number
  staleDays: number
  reviewDays: number
}

export const DEFAULT_RISK_POLICY: RiskPolicyConfig = { inactiveDays: 90, staleDays: 180, reviewDays: 365 }

const DAY = 86_400_000

export function daysSince(iso: string | null, now = Date.now()) {
  if (!iso) return null
  return Math.floor((now - new Date(iso).getTime()) / DAY)
}

export function levelFor(score: number): RiskLevel {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

/** Display score is the sum of the factors shown, capped at 100. */
export function scoreFromFactors(factors: Array<{ points: number }>): { score: number; level: RiskLevel } {
  const score = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0))
  return { score, level: levelFor(score) }
}

export type IdentityRiskResult = {
  score: number
  level: RiskLevel
  factors: RiskFactor[]
  recommendedAction: RecommendedAction
}

const STUB_RESULT: IdentityRiskResult = { score: 0, level: 'low', factors: [], recommendedAction: 'keep' }

/** Guest factors, privileged overlay, or reserved stub (score 0). */
export const CLASS_FACTOR_SETS: Record<IdentityClass, 'external' | 'privileged_only' | 'stub'> = {
  external: 'external',
  human_internal: 'privileged_only',
  privileged: 'privileged_only',
  non_human: 'privileged_only',
  group: 'privileged_only',
  agent: 'stub',
}

/**
 * Shared identity risk. External uses the current guest factor set bit-identical
 * when no privileged overlay applies. Privileged-only classes stay 0 until
 * `privileged.isPrivileged`. Combined score caps at 100. Does not write Graph.
 */
export function computeIdentityRisk(
  identityClass: IdentityClass,
  input: RiskInput,
  policy: RiskPolicyConfig = DEFAULT_RISK_POLICY,
  now = Date.now(),
): IdentityRiskResult {
  const set = CLASS_FACTOR_SETS[identityClass]
  if (set === 'stub') return STUB_RESULT
  const base = set === 'external' ? scoreExternal(input, policy, now) : STUB_RESULT
  if (!input.privileged?.isPrivileged) return base
  const overlay = scorePrivilegedOverlay(input.privileged, now)
  const factors = [...base.factors, ...overlay.factors]
  const score = Math.min(100, base.score + overlay.score)
  const level = levelFor(score)
  return {
    score,
    level,
    factors,
    recommendedAction: overlayRecommendedAction(level, base.recommendedAction),
  }
}

/** Hub columns mirrored from a score. Guest rows also keep risk_factors. */
export function identityRiskPatch(risk: IdentityRiskResult) {
  return {
    risk_score: risk.score,
    risk_level: risk.level,
    recommended_action: risk.recommendedAction,
  }
}

export function computeRisk(input: RiskInput, policy: RiskPolicyConfig = DEFAULT_RISK_POLICY, now = Date.now()) {
  return computeIdentityRisk('external', input, policy, now)
}

function scoreExternal(input: RiskInput, policy: RiskPolicyConfig, now: number): IdentityRiskResult {
  const factors: RiskFactor[] = []
  const add = (key: string, label: string, points: number, detail?: string) => factors.push({ key, label, points, detail })

  const lastActivity = [input.lastSignInAt, input.lastNonInteractiveSignInAt ?? null]
    .filter(Boolean)
    .sort()
    .at(-1) as string | undefined
  const inactiveDays = daysSince(lastActivity ?? null, now)
  const ageDays = daysSince(input.createdAt, now)
  const sensitiveCount = input.memberships.filter((m) => m.isSensitive).length
  const totalAccess = input.memberships.length
  const ownerCount = input.memberships.filter((m) => m.isOwner).length

  if (input.invitationStatus === 'PendingAcceptance') {
    if ((ageDays ?? 0) > 30) add('pending_invite', 'Invitation never accepted', 20, `Invited ${ageDays} days ago`)
    else add('pending_invite_recent', 'Invitation pending', 5)
  } else if (!lastActivity) {
    add('never_signed_in', 'Never signed in', (ageDays ?? 0) > policy.inactiveDays ? 25 : 10, ageDays ? `Account is ${ageDays} days old` : undefined)
  } else if (inactiveDays !== null) {
    if (inactiveDays > policy.staleDays) add('inactive_stale', `Inactive ${inactiveDays} days`, 30, `Threshold ${policy.staleDays} days`)
    else if (inactiveDays > policy.inactiveDays) add('inactive', `Inactive ${inactiveDays} days`, 18, `Threshold ${policy.inactiveDays} days`)
  }

  if (!input.hasSponsor) add('no_sponsor', 'No sponsor assigned', 12)
  else if (input.sponsorEnabled === false) add('sponsor_disabled', 'Sponsor account is disabled', 15)

  switch (input.domainClassification) {
    case 'blocked':
      add('domain_blocked', 'Domain is blocked', 35)
      break
    case 'unknown':
      add('domain_unknown', 'Unclassified external domain', 12)
      break
    case 'temporary':
      add('domain_temporary', 'Temporary-engagement domain', 8)
      break
    default:
      break
  }

  if (sensitiveCount > 0) add('sensitive_access', `Access to ${sensitiveCount} sensitive resource${sensitiveCount === 1 ? '' : 's'}`, Math.min(30, 12 + sensitiveCount * 6))
  if (totalAccess >= 10) add('broad_access', `Broad access (${totalAccess} resources)`, 12)
  else if (totalAccess >= 5) add('wide_access', `Wide access (${totalAccess} resources)`, 6)
  if (ownerCount > 0) add('owner_rights', `Owner of ${ownerCount} resource${ownerCount === 1 ? '' : 's'}`, 10)

  if (!input.accountEnabled && totalAccess > 0) add('disabled_with_access', 'Disabled account still holds memberships', 10)

  const reviewAge = daysSince(input.lastReviewedAt, now)
  if (reviewAge === null) {
    if ((ageDays ?? 0) > policy.reviewDays) add('never_reviewed', 'Never reviewed (account older than policy)', 10)
  } else if (reviewAge > policy.reviewDays) add('review_overdue', `Last review ${reviewAge} days ago`, 8)

  if (input.authMethods.length === 0 && lastActivity) add('no_mfa', 'No registered authentication methods', 6)

  const raw = factors.reduce((sum, f) => sum + f.points, 0)
  const score = Math.min(100, raw)
  const level = levelFor(score)

  let recommendedAction: RecommendedAction = 'keep'
  if (input.domainClassification === 'blocked') recommendedAction = 'remove'
  else if (level === 'critical') recommendedAction = sensitiveCount > 0 && lastActivity ? 'remove_selected' : 'remove'
  else if (level === 'high') recommendedAction = totalAccess === 0 ? 'remove' : inactiveDays && inactiveDays > policy.staleDays ? 'disable' : 'review'
  else if (level === 'medium') recommendedAction = 'review'

  return { score, level, factors, recommendedAction }
}
