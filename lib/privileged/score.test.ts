import { describe, expect, it } from 'vitest'
import { privilegedDemoAdeleProfile, privilegedFixture, privilegedProfileFixture } from '@/lib/privileged/fixtures'
import { privilegedDisplayRisk, countGlobalAdmins } from '@/lib/privileged/score'
import { scoreFromFactors } from '@/lib/risk/engine'

const NOW = Date.parse('2026-11-21T12:00:00.000Z')

describe('privilegedDisplayRisk', () => {
  it('matches overview, role holders, and profile for Lee Gu from the same overlay', () => {
    const detail = privilegedFixture(true, NOW)
    const profile = privilegedProfileFixture(true, 'id-lee')
    const holder = detail.holders.find((row) => row.identityId === 'id-lee')
    const highest = detail.highestRisk.find((row) => row.identityId === 'id-lee')
    expect(profile.factors.length).toBeGreaterThan(0)
    expect(profile.riskScore).toBe(scoreFromFactors(profile.factors).score)
    expect(profile.riskLevel).toBe(scoreFromFactors(profile.factors).level)
    expect(holder?.riskScore).toBe(profile.riskScore)
    expect(holder?.riskLevel).toBe(profile.riskLevel)
    if (highest) {
      expect(highest.riskScore).toBe(profile.riskScore)
      expect(highest.riskLevel).toBe(profile.riskLevel)
    }
    expect(profile.riskScore).not.toBe(88)
    expect(profile.riskLevel).not.toBe('critical')
  })

  it('ignores Adele Admin stored 71 and classifies from overlay factors', () => {
    const profile = privilegedDemoAdeleProfile(true)
    expect(profile.riskScore).toBe(scoreFromFactors(profile.factors).score)
    expect(profile.riskScore).not.toBe(71)
    expect(profile.riskLevel).toBe(scoreFromFactors(profile.factors).level)
  })

  it('matches Adele Vance holders and profile from the same overlay', () => {
    const detail = privilegedFixture(true, NOW)
    const profile = privilegedProfileFixture(true, 'id-adele')
    const holder = detail.holders.find((row) => row.identityId === 'id-adele')
    const highest = detail.highestRisk.find((row) => row.identityId === 'id-adele')
    expect(holder?.riskScore).toBe(profile.riskScore)
    expect(holder?.riskLevel).toBe(profile.riskLevel)
    if (highest) {
      expect(highest.riskScore).toBe(profile.riskScore)
      expect(highest.riskLevel).toBe(profile.riskLevel)
    }
    expect(profile.riskScore).not.toBe(71)
    expect(profile.riskScore).toBe(scoreFromFactors(profile.factors).score)
  })

  it('counts Global Administrators from template ids, not stored scores', () => {
    const gaRole = {
      id: 'role-ga',
      privilege_tier: 0 as const,
      template_id: '62e90394-69f5-4237-9190-012177145e10',
    }
    expect(
      countGlobalAdmins(
        [
          { id: 'a', principal_identity_id: 'id-1', assignment_type: 'active', member_type: 'direct', directory_scope_id: '/', directory_role_id: 'role-ga' },
          { id: 'b', principal_identity_id: 'id-1', assignment_type: 'eligible', member_type: 'direct', directory_scope_id: '/', directory_role_id: 'role-ga' },
          { id: 'c', principal_identity_id: 'id-2', assignment_type: 'active', member_type: 'direct', directory_scope_id: '/', directory_role_id: 'role-ga' },
        ],
        [gaRole],
      ),
    ).toBe(2)
  })

  it('recomputes the same display score when called twice', () => {
    const profile = privilegedProfileFixture(true, 'id-lee')
    const again = privilegedDisplayRisk({
      identity: {
        id: 'id-lee',
        identity_class: profile.identityClass,
        is_privileged: true,
        status: profile.status,
        last_reviewed_at: profile.lastReviewedAt,
        last_activity_at: profile.lastActivityAt,
        owner_display_name: profile.ownerDisplayName,
        owner_kind: profile.ownerKind,
        dedicated_admin: profile.dedicatedAdmin,
        auth_methods: ['microsoftAuthenticatorAuthenticationMethod'],
      },
      assignments: profile.assignments.map((row) => ({
        id: row.id,
        principal_identity_id: profile.identityId,
        assignment_type: row.state === 'eligible' ? 'eligible' : 'active',
        member_type: row.memberType,
        directory_scope_id: '/',
        directory_role_id: row.roleId,
      })),
      roles: profile.assignments.map((row) => ({
        id: row.roleId,
        privilege_tier: row.privilegeTier,
        template_id: undefined,
      })),
      pimAvailable: true,
      globalAdminCount: 1,
      now: NOW,
    })
    expect(again.score).toBe(profile.riskScore)
    expect(again.level).toBe(profile.riskLevel)
  })
})
