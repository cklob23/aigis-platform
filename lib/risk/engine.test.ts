import { describe, expect, it } from 'vitest'
import type { IdentityClass } from '@/lib/types'
import {
  CLASS_FACTOR_SETS,
  computeIdentityRisk,
  computeRisk,
  identityRiskPatch,
  scoreFromFactors,
  type RiskInput,
} from '@/lib/risk/engine'
import type { PrivilegedRiskContext } from '@/lib/risk/privileged'

function privilegedStub(partial: Partial<PrivilegedRiskContext> = {}): PrivilegedRiskContext {
  return {
    isPrivileged: false,
    identityClass: 'human_internal',
    accountKind: 'user',
    accountEnabled: true,
    lastActivityAt: '2026-11-01T00:00:00.000Z',
    lastReviewedAt: '2026-06-01T00:00:00.000Z',
    ownerKind: 'assigned',
    ownerIdentityId: 'owner-1',
    dedicatedAdmin: true,
    authMethods: ['microsoftAuthenticatorAuthenticationMethod'],
    authMethodsKnown: true,
    hasP1: true,
    hasP2: true,
    globalAdminCount: 2,
    assignments: [],
    ...partial,
  }
}

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

  it('keeps guests without roles bit-identical even when privileged is omitted or false', () => {
    for (const sample of GOLDENS) {
      expect(computeIdentityRisk('external', { ...sample, privileged: undefined }, undefined, NOW)).toEqual(computeRisk(sample, undefined, NOW))
      expect(computeIdentityRisk('external', { ...sample, privileged: { ...privilegedStub(), isPrivileged: false } }, undefined, NOW)).toEqual(
        computeRisk(sample, undefined, NOW),
      )
    }
  })

  it('maps class factor sets: external, privileged_only, agent stub', () => {
    expect(CLASS_FACTOR_SETS.external).toBe('external')
    expect(CLASS_FACTOR_SETS.human_internal).toBe('privileged_only')
    expect(CLASS_FACTOR_SETS.non_human).toBe('privileged_only')
    expect(CLASS_FACTOR_SETS.group).toBe('privileged_only')
    expect(CLASS_FACTOR_SETS.privileged).toBe('privileged_only')
    expect(CLASS_FACTOR_SETS.agent).toBe('stub')
  })

  it('keeps non-privileged internals at 0/hidden and agents stub even with overlay input', () => {
    const worst = GOLDENS[6]
    for (const identityClass of ['human_internal', 'privileged', 'non_human', 'group'] as IdentityClass[]) {
      expect(computeIdentityRisk(identityClass, worst, undefined, NOW)).toEqual({
        score: 0,
        level: 'low',
        factors: [],
        recommendedAction: 'keep',
      })
    }
    expect(computeIdentityRisk('agent', { ...worst, privileged: privilegedStub({ isPrivileged: true }) }, undefined, NOW)).toEqual({
      score: 0,
      level: 'low',
      factors: [],
      recommendedAction: 'keep',
    })
  })

  it('adds overlay to any privileged identity and caps combined score at 100', () => {
    const overlay = privilegedStub({
      isPrivileged: true,
      identityClass: 'human_internal',
      assignments: [{ assignmentType: 'active', memberType: 'direct', privilegeTier: 0 }],
    })
    const internal = computeIdentityRisk('human_internal', input({ privileged: overlay }), undefined, NOW)
    expect(internal.score).toBeGreaterThan(0)
    expect(internal.factors.some((f) => f.key === 'tier0_role')).toBe(true)
    expect(internal.recommendedAction).toBe('review')

    const guest = computeIdentityRisk('external', input({ privileged: { ...overlay, identityClass: 'external', accountKind: 'guest' } }), undefined, NOW)
    const base = computeIdentityRisk('external', input(), undefined, NOW)
    expect(guest.score).toBeGreaterThan(base.score)
    expect(guest.factors.some((f) => f.key === 'guest_with_role')).toBe(true)
    expect(guest.recommendedAction).toBe('review')

    const piled = computeIdentityRisk(
      'external',
      input({
        domainClassification: 'blocked',
        accountEnabled: false,
        privileged: {
          ...overlay,
          identityClass: 'external',
          accountKind: 'guest',
          accountEnabled: false,
          lastReviewedAt: null,
          ownerKind: 'none',
          ownerIdentityId: null,
          authMethods: [],
          globalAdminCount: 8,
          assignments: [
            { assignmentType: 'active', memberType: 'direct', privilegeTier: 0 },
            { assignmentType: 'active', memberType: 'direct', privilegeTier: 1 },
          ],
        },
      }),
      undefined,
      NOW,
    )
    expect(piled.score).toBe(100)
    expect(piled.recommendedAction).toBe('review')
  })

  it('derives level from the factor sum', () => {
    expect(scoreFromFactors([{ points: 30 }, { points: 25 }, { points: 10 }])).toEqual({ score: 65, level: 'high' })
    expect(scoreFromFactors([{ points: 80 }, { points: 40 }])).toEqual({ score: 100, level: 'critical' })
    expect(scoreFromFactors([])).toEqual({ score: 0, level: 'low' })
  })

  it('dual-persist patch mirrors score, level, and recommended action onto the hub', () => {
    const risk = computeIdentityRisk('external', GOLDENS[1], undefined, NOW)
    expect(identityRiskPatch(risk)).toEqual({
      risk_score: risk.score,
      risk_level: risk.level,
      recommended_action: risk.recommendedAction,
    })
    expect(risk.score).toBeGreaterThan(0)
  })
})
