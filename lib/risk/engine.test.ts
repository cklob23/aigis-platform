import { describe, expect, it } from 'vitest'
import type { IdentityClass } from '@/lib/types'
import {
  CLASS_FACTOR_SETS,
  computeIdentityRisk,
  computeRisk,
  identityRiskPatch,
  type RiskInput,
} from '@/lib/risk/engine'

const NOW = Date.parse('2026-11-18T00:00:00.000Z')

function input(partial: Partial<RiskInput> = {}): RiskInput {
  return {
    accountEnabled: true,
    invitationStatus: 'Accepted',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastSignInAt: '2026-11-01T00:00:00.000Z',
    lastNonInteractiveSignInAt: null,
    authMethods: ['microsoftAuthenticatorAuthenticationMethod'],
    hasSponsor: true,
    sponsorEnabled: true,
    domainClassification: 'vendor',
    lastReviewedAt: '2026-06-01T00:00:00.000Z',
    memberships: [{ isSensitive: false, isOwner: false, type: 'member' }],
    ...partial,
  }
}

const GOLDENS: RiskInput[] = [
  input(),
  input({ hasSponsor: false }),
  input({ sponsorEnabled: false }),
  input({ invitationStatus: 'PendingAcceptance', lastSignInAt: null, createdAt: '2025-01-01T00:00:00.000Z' }),
  input({ lastSignInAt: null, lastNonInteractiveSignInAt: null }),
  input({ lastSignInAt: '2025-01-01T00:00:00.000Z' }),
  input({ domainClassification: 'blocked' }),
  input({ domainClassification: 'unknown' }),
  input({ domainClassification: 'temporary' }),
  input({
    memberships: [
      { isSensitive: true, isOwner: true, type: 'owner' },
      { isSensitive: true, isOwner: false, type: 'member' },
      { isSensitive: false, isOwner: false, type: 'member' },
    ],
  }),
  input({
    memberships: Array.from({ length: 12 }, () => ({ isSensitive: false, isOwner: false, type: 'member' })),
  }),
  input({ accountEnabled: false, memberships: [{ isSensitive: true, isOwner: false, type: 'member' }] }),
  input({ lastReviewedAt: null, createdAt: '2024-01-01T00:00:00.000Z' }),
  input({ lastReviewedAt: '2024-01-01T00:00:00.000Z' }),
  input({ authMethods: [] }),
]

describe('computeIdentityRisk', () => {
  it('matches computeRisk bit-identical on the external path', () => {
    for (const sample of GOLDENS) {
      expect(computeIdentityRisk('external', sample, undefined, NOW)).toEqual(computeRisk(sample, undefined, NOW))
    }
  })

  it('scores stub classes at 0 with no factors', () => {
    const stubs: IdentityClass[] = ['human_internal', 'privileged', 'non_human', 'agent']
    const worst = GOLDENS[6]
    for (const identityClass of stubs) {
      expect(CLASS_FACTOR_SETS[identityClass]).toBe('stub')
      expect(computeIdentityRisk(identityClass, worst, undefined, NOW)).toEqual({
        score: 0,
        level: 'low',
        factors: [],
        recommendedAction: 'keep',
      })
    }
  })

  it('dual-persist patch mirrors score, level, and recommended action onto the hub', () => {
    const risk = computeIdentityRisk('external', GOLDENS[1], undefined, NOW)
    expect(identityRiskPatch(risk)).toEqual({
      risk_score: risk.score,
      risk_level: risk.level,
      recommended_action: risk.recommendedAction,
      risk_factors: risk.factors,
    })
    expect(risk.score).toBeGreaterThan(0)
  })
})
