import { describe, expect, it } from 'vitest'
import { gradyGuestFixture, privilegedDemoAdeleProfile, privilegedFixture, privilegedGuestListFixture, privilegedProfileFixture } from '@/lib/privileged/fixtures'
import { filterSortPageGuests } from '@/lib/guests/display'
import { applyCombinedGuestDisplay, privilegedDisplayRisk, countGlobalAdmins } from '@/lib/privileged/score'
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

  it('ignores Adele Admin stored 71 and skips eligible_not_activated after a matching activation', () => {
    const profile = privilegedDemoAdeleProfile(true)
    expect(profile.riskScore).toBe(scoreFromFactors(profile.factors).score)
    expect(profile.riskScore).not.toBe(71)
    expect(profile.factors.map((f) => f.key)).not.toContain('eligible_not_activated')
    expect(profile.riskLevel).toBe(scoreFromFactors(profile.factors).level)
    expect(profile.riskScore).toBe(profile.factors.reduce((sum, f) => sum + f.points, 0))
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
        activatedRoleKeys: profile.activations.map((row) => row.roleName),
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
        display_name: row.roleName,
        template_id: undefined,
      })),
      pimAvailable: true,
      globalAdminCount: 1,
      now: NOW,
    })
    expect(again.score).toBe(profile.riskScore)
    expect(again.level).toBe(profile.riskLevel)
  })

  it('combines guest base factors with the privileged overlay for Grady Archie', () => {
    const profile = privilegedProfileFixture(true, 'id-grady')
    const holder = privilegedFixture(true, NOW).holders.find((row) => row.identityId === 'id-grady')
    const guest = gradyGuestFixture()
    expect(profile.identityClass).toBe('external')
    expect(profile.factors.some((f) => f.key === 'guest_with_role')).toBe(true)
    expect(profile.factors.some((f) => f.key === 'no_sponsor')).toBe(true)
    expect(profile.riskScore).toBe(scoreFromFactors(profile.factors).score)
    expect(profile.riskScore).toBeLessThan(100)
    expect(holder?.riskScore).toBe(profile.riskScore)
    expect(guest.risk_score).toBe(profile.riskScore)
    expect(guest.risk_level).toBe(profile.riskLevel)
    expect(guest.risk_factors.map((f) => f.key).sort()).toEqual(profile.factors.map((f) => f.key).sort())
    expect(profile.riskScore).not.toBe(76)
    expect(profile.factors.some((f) => f.key === 'no_owner')).toBe(false)
    expect(profile.riskScore).toBe(71)
    expect(profile.riskLevel).toBe('high')
  })

  it('leaves unprivileged guest scores unchanged', () => {
    const guest = gradyGuestFixture()
    const unprivileged = { ...guest, identity_id: 'id-plain', risk_score: 41, risk_level: 'medium' as const }
    expect(applyCombinedGuestDisplay(unprivileged, { ...privilegedOverlayForTest(), isPrivileged: false })).toBe(unprivileged)
    expect(applyCombinedGuestDisplay(unprivileged, null).risk_score).toBe(41)
  })

  it('filters, sorts, and pages guests from combined scores while leaving unprivileged stored scores', () => {
    const guests = privilegedGuestListFixture()
    const grady = guests.find((row) => row.display_name === 'Grady Archie')
    const jordan = guests.find((row) => row.display_name === 'Jordan Hale')
    expect(grady?.risk_score).toBe(71)
    expect(jordan?.risk_score).toBe(41)
    const high = filterSortPageGuests(guests, { risk: 'high', sort: 'risk', page: 1, pageSize: 50 })
    const critical = filterSortPageGuests(guests, { risk: 'critical', sort: 'risk', page: 1, pageSize: 50 })
    expect(high.guests.map((row) => row.display_name)).toContain('Grady Archie')
    expect(critical.guests.map((row) => row.display_name)).toContain('Fabrikam Vendor')
    expect(high.guests.map((row) => row.display_name)).not.toContain('Jordan Hale')
    const paged = filterSortPageGuests(guests, { sort: 'risk', page: 1, pageSize: 4 })
    expect(paged.guests).toHaveLength(4)
    expect(paged.guests.map((row) => row.display_name)).toEqual(['Fabrikam Vendor', 'Grady Archie', 'Jordan Hale', 'Sam Ortiz'])
  })
})

function privilegedOverlayForTest() {
  return {
    isPrivileged: true,
    identityClass: 'external' as const,
    accountKind: 'guest',
    accountEnabled: true,
    lastActivityAt: '2026-11-07T00:00:00.000Z',
    lastReviewedAt: '2026-08-01T00:00:00.000Z',
    ownerKind: 'none' as const,
    ownerIdentityId: null,
    dedicatedAdmin: false,
    authMethods: ['microsoftAuthenticatorAuthenticationMethod'],
    authMethodsKnown: true,
    hasP1: true,
    hasP2: true,
    globalAdminCount: 1,
    assignments: [],
  }
}
