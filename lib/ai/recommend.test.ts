import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_SETTINGS } from '@/lib/types'
import { explainRecommendation, mergeAiSettings, parseAiSettings } from '@/lib/ai/recommend'

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
    expect(out.body).toContain('No sponsor assigned (+12)')
    expect(out.body).toContain('not an access change')
    expect(out.citations.map((c) => c.key)).toEqual(['no_sponsor', 'domain_unknown'])
  })

  it('explains a privilege overlay recommendation without changing access', () => {
    const out = explainRecommendation({
      recommendedAction: 'review',
      displayName: 'Adele Admin',
      factors: [
        { key: 'privilege_t0', label: 'Tier 0 control-plane role', points: 40, detail: 'T0' },
        { key: 'standing_privileged', label: 'Standing privileged assignment', points: 16 },
      ],
    })
    expect(out.title).toContain('Review')
    expect(out.body).toContain('Adele Admin')
    expect(out.body).toContain('Tier 0 control-plane role (+40')
    expect(out.body).toContain('not an access change')
    expect(out.recommendedAction).toBe('review')
  })
})

describe('AI module isolation', () => {
  it('does not import Graph writes or remediateGuest', () => {
    const files = ['lib/ai/recommend.ts', 'lib/actions/ai.ts']
    for (const rel of files) {
      const src = readFileSync(path.join(root, rel), 'utf8')
      expect(src).not.toMatch(/from ['"]@\/lib\/graph/)
      expect(src).not.toMatch(/from ['"]@\/lib\/actions\/remediation/)
      expect(src).not.toMatch(/import\s*\{[^}]*remediateGuest/)
      expect(src).not.toMatch(/GraphClient/)
    }
  })

  it('keeps privilege overlay recommend-only', () => {
    const src = readFileSync(path.join(root, 'lib/risk/overlay.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]@\/lib\/graph/)
    expect(src).not.toMatch(/from ['"]@\/lib\/actions\/remediation/)
    expect(src).not.toMatch(/GraphClient/)
  })
})
