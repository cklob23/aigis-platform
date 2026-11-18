import { DEFAULT_AI_SETTINGS, type AiSettings, type RecommendedAction, type RiskFactor } from '@/lib/types'
import { RECOMMENDATION_LABELS, RECOMMENDATION_SUMMARY, topFactors } from '@/lib/risk/recommendation'

export type ExplanationCitation = {
  key: string
  label: string
  points: number
  detail?: string
}

export type RecommendationExplanation = {
  title: string
  body: string
  recommendedAction: RecommendedAction
  citations: ExplanationCitation[]
}

export function parseAiSettings(settings: Record<string, unknown> | null | undefined): AiSettings {
  const raw = (settings?.ai ?? {}) as Partial<AiSettings>
  return {
    enabled: raw.enabled === true,
    mode: 'on_demand',
  }
}

/** Merge the AI flag without touching enforcement_mode or other tenant settings. */
export function mergeAiSettings(settings: Record<string, unknown>, enabled: boolean): Record<string, unknown> {
  return {
    ...settings,
    ai: { ...DEFAULT_AI_SETTINGS, enabled, mode: 'on_demand' as const },
  }
}

/**
 * Deterministic explanation of the existing risk recommendation.
 * Cites score factors. Recommend only: never changes access.
 */
export function explainRecommendation(input: {
  recommendedAction: RecommendedAction
  factors: RiskFactor[]
  displayName?: string | null
}): RecommendationExplanation {
  const citations = topFactors(input.factors, 5).map((f) => ({
    key: f.key,
    label: f.label,
    points: f.points,
    detail: f.detail,
  }))
  const who = input.displayName?.trim() || 'This identity'
  const action = RECOMMENDATION_LABELS[input.recommendedAction]
  const summary = RECOMMENDATION_SUMMARY[input.recommendedAction]
  const cited =
    citations.length === 0
      ? 'No risk factors are recorded, so the score does not justify a change.'
      : citations.map((c) => `${c.label} (+${c.points}${c.detail ? `, ${c.detail}` : ''})`).join('; ')
  return {
    title: `Recommended action: ${action}`,
    body: `${who}: ${summary} This is an explanation of the current score, not an access change. A human with remediation permission still has to approve any Entra change. Cited factors: ${cited}`,
    recommendedAction: input.recommendedAction,
    citations,
  }
}
