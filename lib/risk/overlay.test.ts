import { describe, expect, it } from 'vitest'
import { CLASS_FACTOR_SETS, computeIdentityRisk, DEFAULT_RISK_POLICY } from '@/lib/risk/engine'
import { applyPrivilegeOverlay, computePrivilegeOverlay, type PrivilegeOverlayInput } from '@/lib/risk/overlay'

const NOW = Date.parse('2026-11-18T00:00:00.000Z')

function overlay(partial: Partial<PrivilegeOverlayInput> = {}): PrivilegeOverlayInput {
  return {
    isPrivileged: true,
    privilegeTier: 0,
    standingPrivileged: true,
    eligiblePrivileged: false,
    groupPimOwner: false,
    accountEnabled: true,
    lastActivityAt: '2026-11-01T00:00:00.000Z',
    firstSeenAt: '2025-01-01T00:00:00.000Z',
    activityKnown: true,
    ...partial,
  }
}

describe('computePrivilegeOverlay', () => {
  it('returns stub when the identity holds no privilege', () => {
    expect(
      computePrivilegeOverlay(
        overlay({
          isPrivileged: false,
          privilegeTier: null,
          standingPrivileged: false,
          eligiblePrivileged: false,
          groupPimOwner: false,
        }),
        DEFAULT_RISK_POLICY,
        NOW,
      ),
    ).toEqual({ score: 0, level: 'low', factors: [], recommendedAction: 'keep' })
  })

  it('scores standing T0 as high review, never remove', () => {
    const risk = computePrivilegeOverlay(overlay(), DEFAULT_RISK_POLICY, NOW)
    expect(risk.factors.map((f) => f.key)).toEqual(['privilege_t0', 'standing_privileged'])
    expect(risk.score).toBe(56)
    expect(risk.level).toBe('high')
    expect(risk.recommendedAction).toBe('review')
    expect(risk.recommendedAction).not.toBe('remove')
  })

  it('scores eligible-only T0 without a standing factor', () => {
    const risk = computePrivilegeOverlay(
      overlay({ standingPrivileged: false, eligiblePrivileged: true }),
      DEFAULT_RISK_POLICY,
      NOW,
    )
    expect(risk.factors.map((f) => f.key)).toEqual(['privilege_t0', 'eligible_privileged'])
    expect(risk.score).toBe(46)
    expect(risk.level).toBe('medium')
    expect(risk.recommendedAction).toBe('review')
  })

  it('does not double-count eligible when standing is present', () => {
    const risk = computePrivilegeOverlay(
      overlay({ standingPrivileged: true, eligiblePrivileged: true }),
      DEFAULT_RISK_POLICY,
      NOW,
    )
    expect(risk.factors.map((f) => f.key)).toEqual(['privilege_t0', 'standing_privileged'])
  })

  it('scores T1 and T2 standing below T0', () => {
    const t1 = computePrivilegeOverlay(overlay({ privilegeTier: 1 }), DEFAULT_RISK_POLICY, NOW)
    const t2 = computePrivilegeOverlay(overlay({ privilegeTier: 2 }), DEFAULT_RISK_POLICY, NOW)
    expect(t1.score).toBe(38)
    expect(t1.level).toBe('medium')
    expect(t2.score).toBe(26)
    expect(t2.level).toBe('medium')
  })

  it('adds group PIM owner and disabled factors', () => {
    const owner = computePrivilegeOverlay(
      overlay({
        isPrivileged: false,
        privilegeTier: null,
        standingPrivileged: false,
        groupPimOwner: true,
      }),
      DEFAULT_RISK_POLICY,
      NOW,
    )
    expect(owner.score).toBe(8)
    expect(owner.recommendedAction).toBe('keep')
    const disabled = computePrivilegeOverlay(overlay({ accountEnabled: false }), DEFAULT_RISK_POLICY, NOW)
    expect(disabled.factors.some((f) => f.key === 'privileged_disabled')).toBe(true)
  })

  it('applies inactivity only when activity is known', () => {
    const stale = computePrivilegeOverlay(
      overlay({ lastActivityAt: '2025-01-01T00:00:00.000Z' }),
      DEFAULT_RISK_POLICY,
      NOW,
    )
    expect(stale.factors.some((f) => f.key === 'privileged_inactive_stale')).toBe(true)
    expect(stale.score).toBe(80)
    expect(stale.level).toBe('critical')
    expect(stale.recommendedAction).toBe('disable')

    const unknown = computePrivilegeOverlay(
      overlay({ lastActivityAt: null, activityKnown: false }),
      DEFAULT_RISK_POLICY,
      NOW,
    )
    expect(unknown.factors.map((f) => f.key)).toEqual(['privilege_t0', 'standing_privileged'])

    const never = computePrivilegeOverlay(overlay({ lastActivityAt: null, activityKnown: true }), DEFAULT_RISK_POLICY, NOW)
    expect(never.factors.some((f) => f.key === 'privileged_never_signed_in')).toBe(true)
  })
})

describe('applyPrivilegeOverlay', () => {
  it('leaves guest scoring bit-identical when overlay is empty', () => {
    const base = computeIdentityRisk(
      'external',
      {
        accountEnabled: true,
        invitationStatus: 'Accepted',
        createdAt: '2025-01-01T00:00:00.000Z',
        lastSignInAt: '2026-11-01T00:00:00.000Z',
        authMethods: ['microsoftAuthenticatorAuthenticationMethod'],
        hasSponsor: false,
        sponsorEnabled: true,
        domainClassification: 'vendor',
        lastReviewedAt: '2026-06-01T00:00:00.000Z',
        memberships: [{ isSensitive: false, isOwner: false, type: 'member' }],
      },
      DEFAULT_RISK_POLICY,
      NOW,
    )
    expect(applyPrivilegeOverlay(base, computePrivilegeOverlay(overlay({ isPrivileged: false, privilegeTier: null, standingPrivileged: false }), DEFAULT_RISK_POLICY, NOW))).toEqual(
      base,
    )
  })

  it('does not replace the class stub table with a privileged factor set', () => {
    expect(CLASS_FACTOR_SETS.human_internal).toBe('stub')
    expect(CLASS_FACTOR_SETS.privileged).toBe('stub')
  })
})
