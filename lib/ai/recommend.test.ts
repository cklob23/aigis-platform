import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_SETTINGS } from '@/lib/types'
import { aiExplainEnabled, buildExplainPromptInput, explainRecommendation, mergeAiSettings, parseAiSettings } from '@/lib/ai/recommend'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('parseAiSettings', () => {
  it('defaults off and on-demand', () => {
    expect(parseAiSettings({})).toEqual(DEFAULT_AI_SETTINGS)
    expect(parseAiSettings(undefined)).toEqual({ enabled: false, mode: 'on_demand' })
    expect(parseAiSettings({ ai: { enabled: true, mode: 'always' } })).toEqual({ enabled: true, mode: 'on_demand' })
  })

  it('treats anything other than true as disabled', () => {
    expect(parseAiSettings({ ai: { enabled: 'yes' } }).enabled).toBe(false)
    expect(parseAiSettings({ ai: { enabled: false } }).enabled).toBe(false)
  })
})

describe('mergeAiSettings', () => {
  it('does not change enforcement_mode', () => {
    const next = mergeAiSettings({ enforcement_mode: 'enforce', notifications: { email: true } }, true)
    expect(next.enforcement_mode).toBe('enforce')
    expect(next.ai).toEqual({ enabled: true, mode: 'on_demand' })
    expect(next.notifications).toEqual({ email: true })
  })
})

describe('aiExplainEnabled', () => {
  it('requires the strict true flag', () => {
    expect(aiExplainEnabled({})).toBe(false)
    expect(aiExplainEnabled({ ai: { enabled: true } })).toBe(true)
    expect(aiExplainEnabled({ ai: { enabled: 'true' } })).toBe(false)
  })
})

describe('explainRecommendation', () => {
  it('cites factors and stays recommend-only', () => {
    const out = explainRecommendation({
      recommendedAction: 'review',
      displayName: 'Pat Guest',
      factors: [
        { key: 'no_sponsor', label: 'No sponsor assigned', points: 12 },
        { key: 'domain_unknown', label: 'Unclassified external domain', points: 12, detail: 'ex.example' },
      ],
    })
    expect(out.title).toContain('Review')
    expect(out.body).toContain('Pat Guest')
    expect(out.body).toContain('Top score factors: No sponsor assigned (+12)')
    expect(out.body).toContain('not an access change')
    expect(out.citations.map((c) => c.key)).toEqual(['no_sponsor', 'domain_unknown'])
  })

  it('cites privileged factor keys and never includes justification text', () => {
    const prompt = buildExplainPromptInput({
      recommendedAction: 'review',
      displayName: 'Lee Gu',
      factors: [
        { key: 'permanent_tier0', label: 'Standing (permanent) Tier 0 assignment', points: 30 },
        { key: 'tier0_role', label: 'Holds a Tier 0 directory role', points: 25 },
      ],
      activations: [{ justification: 'Emergency break-glass for clinic outage', roleName: 'PRA' }],
    })
    expect(JSON.stringify(prompt)).not.toMatch(/justification/i)
    expect(JSON.stringify(prompt)).not.toContain('Emergency break-glass')
    const out = explainRecommendation({
      ...prompt,
      kind: 'privileged',
      activations: [{ justification: 'Emergency break-glass for clinic outage' }],
    })
    expect(out.citations.map((c) => c.key)).toEqual(['permanent_tier0', 'tier0_role'])
    expect(out.body).toContain('AIGIS never changes anything in Entra')
    expect(out.body).toContain('account owner or a Global Administrator')
    expect(out.body).not.toContain('sponsor')
    expect(out.body).not.toContain('Graph')
    expect(out.body).not.toContain('Emergency break-glass')
    expect(out.body).toContain('Top score factors:')
    expect(out.body).toContain('Standing (permanent) Tier 0 assignment (+30)')
  })

  it('names assignment changes that need action and never asks to confirm Keep', () => {
    const out = explainRecommendation({
      recommendedAction: 'review',
      displayName: 'Adele Admin',
      kind: 'privileged',
      factors: [
        { key: 'permanent_tier0', label: 'Standing (permanent) Tier 0 assignment', points: 30 },
        { key: 'tier0_role', label: 'Holds a Tier 0 directory role', points: 25 },
        { key: 'no_owner', label: 'Privileged identity has no owner', points: 10 },
      ],
      assignments: [
        { roleName: 'Global Administrator', recommendedChange: 'convert_to_eligible' },
        { roleName: 'Privileged Role Administrator', recommendedChange: null },
      ],
    })
    expect(out.body).toContain('Top score factors:')
    expect(out.body).toContain('Global Administrator: Convert to eligible')
    expect(out.body).not.toContain('Privileged Role Administrator')
    expect(out.body).not.toMatch(/confirm the role/i)
    expect(out.body).not.toContain('Keep')
  })
})

describe('AI module isolation', () => {
  it('does not import Graph writes or remediateGuest', () => {
    const files = ['lib/ai/recommend.ts', 'lib/actions/ai.ts']
    for (const rel of files) {
      const src = readFileSync(path.join(root, rel), 'utf8')
      expect(src).not.toMatch(/from ['"]@\/lib\/graph/)
      expect(src).not.toMatch(/from ['"]@\/lib\/actions\/remediation/)
      expect(src).not.toMatch(/from ['"]@\/lib\/remediation/)
      expect(src).not.toMatch(/import\s*\{[^}]*remediateGuest/)
      expect(src).not.toMatch(/GraphClient/)
    }
  })

  it('returns before writing when the AI flag is off', () => {
    const src = readFileSync(path.join(root, 'lib/actions/ai.ts'), 'utf8')
    expect(src).toMatch(/export async function explainIdentityRecommendation/)
    expect(src).toMatch(/guest_id: null/)
    const identityFn = src.slice(src.indexOf('explainIdentityRecommendation'))
    expect(identityFn.indexOf('aiExplainEnabled')).toBeGreaterThan(-1)
    expect(identityFn.indexOf('aiExplainEnabled')).toBeLessThan(identityFn.indexOf('recommendation_explanations insert'))
  })
})
