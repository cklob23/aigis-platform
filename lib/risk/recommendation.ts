import type { Guest, RecommendedAction, RiskFactor } from '@/lib/types'

/**
 * Presentation helpers for the scoring engine's recommendation.
 * Pure and client-safe: nothing here changes how a score or action is computed.
 */

export const RECOMMENDATION_LABELS: Record<RecommendedAction, string> = {
  keep: 'Keep',
  review: 'Review',
  remove_selected: 'Trim access',
  disable: 'Disable',
  remove: 'Remove',
}

export const RECOMMENDATION_SUMMARY: Record<RecommendedAction, string> = {
  keep: 'No change recommended.',
  review: 'Confirm with the sponsor or resource owner before changing access.',
  remove_selected: 'Remove sensitive-resource memberships; the account stays active.',
  disable: 'Block sign-in and keep memberships for an easy restore.',
  remove: 'Remove every membership and disable the account.',
}

/** The top-weighted score factors, in the same wording the score breakdown uses. */
export function topFactors(factors: RiskFactor[], limit = 3) {
  return [...factors].sort((a, b) => b.points - a.points).slice(0, limit)
}

export function recommendationReason(factors: RiskFactor[], limit = 3) {
  const top = topFactors(factors, limit)
  if (top.length === 0) return 'No risk factors recorded.'
  return top.map((f) => f.label).join(' · ')
}

/** Which of a guest's memberships the recommended action would touch. */
export function affectedMemberships<T extends { resource: { is_sensitive: boolean } }>(action: RecommendedAction, memberships: T[]) {
  switch (action) {
    case 'remove':
      return memberships
    case 'remove_selected':
      return memberships.filter((m) => m.resource.is_sensitive)
    default:
      return []
  }
}

export function describeRecommendation(guest: Pick<Guest, 'recommended_action' | 'risk_factors'>) {
  return { label: RECOMMENDATION_LABELS[guest.recommended_action], summary: RECOMMENDATION_SUMMARY[guest.recommended_action], reason: recommendationReason(guest.risk_factors) }
}

/** Causes a risk queue can be grouped by. Keys are the engine's factor keys. */
export const RISK_CAUSES = [
  { key: 'sponsor_disabled', label: 'Sponsor account is disabled', description: 'The internal sponsor can no longer vouch for this access. Reassign a sponsor or review.' },
  { key: 'pending_invite', label: 'Invitation never accepted', description: 'Invited more than 30 days ago and never redeemed. Usually safe to remove.' },
  { key: 'no_sponsor', label: 'No sponsor assigned', description: 'Nobody inside the tenant owns this relationship.' },
  { key: 'domain_unknown', label: 'Unclassified external domain', description: 'Classify the domain or its organization to settle the risk for every identity on it.' },
  { key: 'sensitive_access', label: 'Sensitive access', description: 'Holds membership in at least one resource marked sensitive.' },
] as const

export type RiskCauseKey = (typeof RISK_CAUSES)[number]['key']

export function isRiskCause(value: string | undefined): value is RiskCauseKey {
  return RISK_CAUSES.some((c) => c.key === value)
}
