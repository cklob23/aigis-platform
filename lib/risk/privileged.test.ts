import { describe, expect, it } from 'vitest'
import { TIER_0_TEMPLATE_IDS } from '@/lib/privileged/tiers'
import {
  DORMANT_ADMIN_DAYS,
  GLOBAL_ADMIN_TEMPLATE_ID,
  OVERLAY_POINTS,
  PRIVILEGED_REVIEW_DAYS,
  overlayRecommendedAction,
  recommendAssignmentChange,
  scorePrivilegedOverlay,
  type PrivilegedRiskContext,
} from '@/lib/risk/privileged'

const NOW = Date.parse('2026-11-21T00:00:00.000Z')
const GA = TIER_0_TEMPLATE_IDS['Global Administrator']

function ctx(partial: Partial<PrivilegedRiskContext> = {}): PrivilegedRiskContext {
  return {
    isPrivileged: true,
    identityClass: 'human_internal',
    accountKind: 'user',
    accountEnabled: true,
    lastActivityAt: '2026-11-20T00:00:00.000Z',
    lastReviewedAt: '2026-06-01T00:00:00.000Z',
    ownerKind: 'assigned',
    ownerIdentityId: 'owner-1',
    dedicatedAdmin: true,
    authMethods: ['microsoftAuthenticatorAuthenticationMethod'],
    authMethodsKnown: true,
    hasP1: true,
    hasP2: true,
    globalAdminCount: 2,
    assignments: [{ assignmentType: 'active', memberType: 'direct', privilegeTier: 0, roleTemplateId: GA, directoryScopeId: '/' }],
    ...partial,
  }
}

function keys(result: ReturnType<typeof scorePrivilegedOverlay>) {
  return result.factors.map((f) => f.key)
}

function points(result: ReturnType<typeof scorePrivilegedOverlay>, key: string) {
  return result.factors.find((f) => f.key === key)?.points
}

describe('scorePrivilegedOverlay', () => {
  it('returns nothing when isPrivileged is false', () => {
    expect(scorePrivilegedOverlay(ctx({ isPrivileged: false }), NOW)).toEqual({
      factors: [],
      score: 0,
      recommendedAction: 'keep',
      assignmentRecommendations: [],
    })
  })

  it('scores listed overlay factors at the planned points', () => {
    expect(OVERLAY_POINTS).toEqual({
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
    })
  })

  it('adds tier and permanent factors for standing T0 with P2', () => {
    const result = scorePrivilegedOverlay(ctx(), NOW)
    expect(points(result, 'tier0_role')).toBe(25)
    expect(points(result, 'permanent_tier0')).toBe(30)
    expect(points(result, 'strong_auth_ok')).toBe(0)
  })

  it('skips permanent_* and eligible_not_activated without P2', () => {
    const result = scorePrivilegedOverlay(ctx({ hasP2: false }), NOW)
    expect(keys(result)).not.toContain('permanent_tier0')
    expect(keys(result)).not.toContain('permanent_tier1')
    expect(keys(result)).not.toContain('eligible_not_activated')
    expect(result.factors.find((f) => f.key === 'active_tier0_unknown')?.label).toContain('P2 needed')
    expect(points(result, 'active_tier0_unknown')).toBe(30)
  })

  it('skips dormant_admin without P1', () => {
    const result = scorePrivilegedOverlay(
      ctx({ hasP1: false, lastActivityAt: '2026-01-01T00:00:00.000Z' }),
      NOW,
    )
    expect(keys(result)).not.toContain('dormant_admin')
  })

  it('scores dormant_admin at 90 days when P1 is present', () => {
    const last = new Date(NOW - DORMANT_ADMIN_DAYS * 86_400_000).toISOString()
    const result = scorePrivilegedOverlay(ctx({ lastActivityAt: last, dedicatedAdmin: true }), NOW)
    expect(points(result, 'dormant_admin')).toBe(20)
  })

  it('scores guest_with_role and sp_with_role by class', () => {
    expect(points(scorePrivilegedOverlay(ctx({ identityClass: 'external', accountKind: 'guest' }), NOW), 'guest_with_role')).toBe(25)
    expect(points(scorePrivilegedOverlay(ctx({ identityClass: 'non_human', accountKind: 'sp' }), NOW), 'sp_with_role')).toBe(15)
  })

  it('skips auth factors when methods are unknown', () => {
    const result = scorePrivilegedOverlay(ctx({ authMethodsKnown: false, authMethods: null }), NOW)
    expect(keys(result)).not.toContain('no_strong_auth')
    expect(keys(result)).not.toContain('strong_auth_ok')
  })

  it('scores no_strong_auth when methods are known empty', () => {
    const result = scorePrivilegedOverlay(ctx({ authMethods: [], authMethodsKnown: true }), NOW)
    expect(points(result, 'no_strong_auth')).toBe(20)
  })

  it('scores remaining overlay factors', () => {
    const result = scorePrivilegedOverlay(
      ctx({
        lastActivityAt: '2026-11-20T00:00:00.000Z',
        dedicatedAdmin: false,
        ownerKind: 'none',
        ownerIdentityId: null,
        accountEnabled: false,
        lastReviewedAt: null,
        globalAdminCount: 6,
        assignments: [
          {
            assignmentType: 'active',
            memberType: 'group',
            privilegeTier: 0,
            roleTemplateId: GA,
            directoryScopeId: '/',
            groupOwned: false,
          },
          {
            assignmentType: 'eligible',
            memberType: 'direct',
            privilegeTier: 1,
            roleTemplateId: 'other',
            directoryScopeId: '/',
          },
        ],
      }),
      NOW,
    )
    expect(points(result, 'tier1_role')).toBe(12)
    expect(points(result, 'permanent_tier0')).toBe(30)
    expect(points(result, 'eligible_not_activated')).toBe(10)
    expect(points(result, 'daily_use_admin')).toBe(8)
    expect(points(result, 'too_many_global_admins')).toBe(6)
    expect(points(result, 'role_via_unowned_group')).toBe(10)
    expect(points(result, 'no_owner')).toBe(10)
    expect(points(result, 'disabled_with_role')).toBe(15)
    expect(points(result, 'not_reviewed_flag')).toBe(10)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('scores privileged_review_overdue on a fixed 90-day cadence, not guest reviewDays', () => {
    const day = 86_400_000
    const at91 = new Date(NOW - (PRIVILEGED_REVIEW_DAYS + 1) * day).toISOString()
    const at89 = new Date(NOW - (PRIVILEGED_REVIEW_DAYS - 1) * day).toISOString()
    const overdue = scorePrivilegedOverlay(ctx({ lastReviewedAt: at91 }), NOW)
    expect(points(overdue, 'privileged_review_overdue')).toBe(10)
    expect(keys(overdue)).not.toContain('not_reviewed_flag')
    const recent = scorePrivilegedOverlay(ctx({ lastReviewedAt: at89 }), NOW)
    expect(keys(recent)).not.toContain('privileged_review_overdue')
    const at90 = new Date(NOW - PRIVILEGED_REVIEW_DAYS * day).toISOString()
    const at90plus = new Date(NOW - PRIVILEGED_REVIEW_DAYS * day - 1).toISOString()
    expect(keys(scorePrivilegedOverlay(ctx({ lastReviewedAt: at90 }), NOW))).not.toContain('privileged_review_overdue')
    expect(keys(scorePrivilegedOverlay(ctx({ lastReviewedAt: at90plus }), NOW))).not.toContain('privileged_review_overdue')
  })

  it('caps overlay at 100', () => {
    const result = scorePrivilegedOverlay(
      ctx({
        identityClass: 'external',
        accountKind: 'guest',
        accountEnabled: false,
        lastActivityAt: '2025-01-01T00:00:00.000Z',
        lastReviewedAt: null,
        ownerKind: 'none',
        ownerIdentityId: null,
        dedicatedAdmin: false,
        authMethods: [],
        globalAdminCount: 8,
        assignments: [
          { assignmentType: 'active', memberType: 'group', privilegeTier: 0, roleTemplateId: GA, groupOwned: false },
          { assignmentType: 'active', memberType: 'direct', privilegeTier: 1 },
          { assignmentType: 'eligible', memberType: 'direct', privilegeTier: 2 },
        ],
      }),
      NOW,
    )
    expect(result.score).toBe(100)
  })
})

describe('recommendAssignmentChange', () => {
  it('evaluates convert_to_eligible, remove_assignment, move_to_dedicated_admin, reduce_scope in order', () => {
    expect(
      recommendAssignmentChange(
        { assignmentType: 'active', memberType: 'direct', privilegeTier: 0, directoryScopeId: '/' },
        { hasP2: true, accountEnabled: true, dormant: false, guest: false, dailyUse: true, dedicatedAdmin: false, assignmentCount: 2 },
      ),
    ).toBe('convert_to_eligible')
    expect(
      recommendAssignmentChange(
        { assignmentType: 'active', memberType: 'direct', privilegeTier: 0 },
        { hasP2: false, accountEnabled: false, dormant: false, guest: false, dailyUse: false, dedicatedAdmin: true, assignmentCount: 1 },
      ),
    ).toBe('remove_assignment')
    expect(
      recommendAssignmentChange(
        { assignmentType: 'active', memberType: 'direct', privilegeTier: 1 },
        { hasP2: false, accountEnabled: true, dormant: false, guest: false, dailyUse: true, dedicatedAdmin: false, assignmentCount: 1 },
      ),
    ).toBe('move_to_dedicated_admin')
    expect(
      recommendAssignmentChange(
        { assignmentType: 'active', memberType: 'direct', privilegeTier: 0, directoryScopeId: '/', roleTemplateId: TIER_0_TEMPLATE_IDS['Application Administrator'] },
        { hasP2: false, accountEnabled: true, dormant: false, guest: false, dailyUse: false, dedicatedAdmin: true, assignmentCount: 2 },
      ),
    ).toBe('reduce_scope')
    expect(
      recommendAssignmentChange(
        { assignmentType: 'eligible', memberType: 'direct', privilegeTier: 0, directoryScopeId: '/', roleTemplateId: GA },
        { hasP2: true, accountEnabled: true, dormant: false, guest: false, dailyUse: false, dedicatedAdmin: true, assignmentCount: 2 },
      ),
    ).toBeNull()
  })
})

describe('overlayRecommendedAction', () => {
  it('never disables a privileged identity', () => {
    expect(overlayRecommendedAction('medium', 'disable')).toBe('review')
    expect(overlayRecommendedAction('high', 'remove')).toBe('review')
    expect(overlayRecommendedAction('critical', 'disable')).toBe('review')
    expect(overlayRecommendedAction('low', 'disable')).toBe('keep')
    expect(overlayRecommendedAction('low', 'keep')).toBe('keep')
  })
})

describe('GLOBAL_ADMIN_TEMPLATE_ID', () => {
  it('matches the Tier 0 Global Administrator template', () => {
    expect(GLOBAL_ADMIN_TEMPLATE_ID).toBe(GA)
  })
})
