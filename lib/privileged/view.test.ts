import { describe, expect, it } from 'vitest'
import { requirePrivilegedDetail } from '@/lib/auth/rbac'
import {
  assignmentState,
  buildPrivilegedHolders,
  buildPrivilegedRoles,
  combinedStateLabel,
  filterHolders,
  holderIdentifier,
  mfaMethodLabel,
  groupHoldersByIdentity,
  nextPrivilegedReviewDueAt,
  privilegedReviewDueOverdue,
  summarizePrivileged,
  summaryHasIdentityNames,
  type PrivilegedAssignmentRow,
  type PrivilegedIdentityRow,
  type PrivilegedRoleRow,
} from '@/lib/privileged/view'
import { privilegedFixture } from '@/lib/privileged/fixtures'
import { privilegedReviewPastCadence } from '@/lib/risk/privileged'
import { canExportPrivileged } from '@/lib/auth/rbac'
import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'

const identity = (over: Partial<PrivilegedIdentityRow> = {}): PrivilegedIdentityRow => ({
  id: 'id-1',
  display_name: 'Adele Admin',
  primary_email: 'adele.admin@northwind.example',
  identity_class: 'human_internal',
  is_privileged: true,
  privilege_tier: 0,
  last_reviewed_at: '2026-10-01T00:00:00.000Z',
  last_activity_at: '2026-11-20T00:00:00.000Z',
  risk_score: 40,
  risk_level: 'medium',
  status: 'active',
  ...over,
})

const assignment = (over: Partial<PrivilegedAssignmentRow> = {}): PrivilegedAssignmentRow => ({
  id: 'asg-1',
  principal_identity_id: 'id-1',
  assignment_type: 'active',
  member_type: 'direct',
  pim_status: null,
  starts_at: null,
  ends_at: null,
  directory_scope_id: '/',
  directory_role_id: 'role-ga',
  ...over,
})

const gaRole: PrivilegedRoleRow = {
  id: 'role-ga',
  display_name: 'Global Administrator',
  privilege_tier: 0,
  is_privileged: true,
  is_built_in: true,
  description: null,
}

describe('assignmentState', () => {
  it('returns Active when PIM is not available', () => {
    expect(assignmentState(assignment({ assignment_type: 'eligible', ends_at: '2027-01-01T00:00:00.000Z' }), false)).toBe('active')
  })

  it('maps eligible, time-bound, activated, and permanent when PIM is available', () => {
    expect(assignmentState(assignment({ assignment_type: 'eligible' }), true)).toBe('eligible')
    expect(assignmentState(assignment({ ends_at: '2027-01-01T00:00:00.000Z' }), true)).toBe('time_bound')
    expect(assignmentState(assignment({ pim_status: 'Activated' }), true)).toBe('activated')
    expect(assignmentState(assignment(), true)).toBe('permanent')
  })
})

describe('summarizePrivileged', () => {
  it('returns counts with no identity names', () => {
    const identities = [identity(), identity({ id: 'id-2', display_name: 'Megan Bowen', primary_email: 'megan@northwind.example', privilege_tier: 1 })]
    const summary = summarizePrivileged(
      identities,
      [assignment(), assignment({ id: 'asg-2', principal_identity_id: 'id-2', directory_role_id: 'role-helpdesk' })],
      [gaRole, { ...gaRole, id: 'role-helpdesk', display_name: 'Helpdesk Administrator', privilege_tier: 1 }],
      true,
    )
    expect(summary.holders).toBe(2)
    expect(summary.byTier.t0).toBe(1)
    expect(summary.byTier.t1).toBe(1)
    expect(summaryHasIdentityNames(summary, identities)).toBe(false)
    expect(JSON.stringify(summary)).not.toContain('Adele')
    expect(JSON.stringify(summary)).not.toContain('Megan')
    expect(JSON.stringify(summary)).not.toContain('northwind.example')
  })

  it('hides Standing Tier 0 findings when PIM is not available', () => {
    const summary = summarizePrivileged(
      [identity()],
      [assignment()],
      [gaRole],
      false,
      [{ finding_type: 'permanent_tier0', title: 'Standing Tier 0 assignment', count: 1 }],
    )
    expect(summary.findings.some((row) => row.finding_type === 'permanent_tier0')).toBe(false)
    expect(summary.pimAvailable).toBe(false)
  })

  it('keeps Standing Tier 0 findings when PIM is available', () => {
    const summary = summarizePrivileged(
      [identity()],
      [assignment()],
      [gaRole],
      true,
      [{ finding_type: 'permanent_tier0', title: 'Standing Tier 0 assignment', count: 1 }],
    )
    expect(summary.findings.some((row) => row.finding_type === 'permanent_tier0')).toBe(true)
  })

  it('renames guest_with_role to External identity with an admin role', () => {
    const summary = summarizePrivileged(
      [identity({ identity_class: 'external' })],
      [assignment()],
      [gaRole],
      true,
      [{ finding_type: 'guest_with_role', title: 'Guest holds a directory role', count: 1 }],
    )
    expect(summary.findings[0]?.title).toBe('External identity with an admin role')
  })
})

describe('getPrivilegedDetail access', () => {
  it('throws for read_only', () => {
    expect(() => requirePrivilegedDetail('read_only')).toThrow(/audit\.view/)
  })
})

describe('export helper', () => {
  it('denies read_only', () => {
    expect(canExportPrivileged('read_only')).toBe(false)
    expect(canExportPrivileged('auditor')).toBe(true)
  })
})

describe('filterHolders', () => {
  it('filters by class, tier, and guest badge identity', () => {
    const detail = privilegedFixture(true)
    const guests = filterHolders(detail.holders, { class: 'external' })
    expect(guests.length).toBeGreaterThan(0)
    expect(guests.every((row) => row.identityClass === 'external')).toBe(true)
    expect(guests.some((row) => row.displayName === 'Fabrikam Vendor')).toBe(true)
    expect(filterHolders(detail.holders, { tier: '0' }).every((row) => row.privilegeTier === 0)).toBe(true)
  })
})

describe('buildPrivilegedHolders', () => {
  it('keeps names only on the detail path', () => {
    const holders = buildPrivilegedHolders([identity()], [assignment()], [gaRole], true)
    expect(holders[0]?.displayName).toBe('Adele Admin')
  })

  it('dedupes one row per identity per role and combines Permanent + Eligible', () => {
    const holders = buildPrivilegedHolders(
      [identity({ display_name: 'Adele Vance' })],
      [
        assignment(),
        assignment({ id: 'elig-1', assignment_type: 'eligible', pim_status: 'Provisioned' }),
        assignment({ id: 'asg-helpdesk', directory_role_id: 'role-helpdesk' }),
      ],
      [
        gaRole,
        { ...gaRole, id: 'role-helpdesk', display_name: 'Helpdesk Administrator', privilege_tier: 1 },
      ],
      true,
    )
    const ga = holders.filter((row) => row.roleName === 'Global Administrator')
    expect(ga).toHaveLength(1)
    expect(combinedStateLabel(ga[0]!.assignmentStates, true)).toBe('Permanent + Eligible')
    expect(holders.filter((row) => row.roleName === 'Helpdesk Administrator')).toHaveLength(1)
  })

  it('skips Directory Readers and Guest Inviter rows', () => {
    const holders = buildPrivilegedHolders(
      [identity()],
      [assignment(), assignment({ id: 'asg-dr', directory_role_id: 'role-directory-readers' })],
      [
        gaRole,
        { id: 'role-directory-readers', display_name: 'Directory Readers', privilege_tier: null, is_privileged: false, is_built_in: true, description: null },
      ],
      true,
    )
    expect(holders).toHaveLength(1)
    expect(holders[0]?.roleName).toBe('Global Administrator')
  })
})

describe('buildPrivilegedRoles', () => {
  it('excludes Directory Readers and Guest Inviter and always lists all 12 Tier 0 roles', () => {
    const roles = buildPrivilegedRoles(
      [
        gaRole,
        { id: 'role-directory-readers', display_name: 'Directory Readers', privilege_tier: null, is_privileged: false, is_built_in: true, description: null },
        { id: 'role-guest-inviter', display_name: 'Guest Inviter', privilege_tier: null, is_privileged: false, is_built_in: true, description: null },
      ],
      [assignment()],
      [identity()],
      true,
    )
    expect(roles.some((row) => row.displayName === 'Directory Readers')).toBe(false)
    expect(roles.some((row) => row.displayName === 'Guest Inviter')).toBe(false)
    for (const name of TIER_0_DIRECTORY_ROLES) {
      expect(roles.some((row) => row.displayName === name)).toBe(true)
    }
    expect(roles.find((row) => row.displayName === 'Partner Tier2 Support')?.holderCount).toBe(0)
  })
})

describe('P2 fixture totals', () => {
  it('matches mock 02 assignment and identity counts', () => {
    const summary = privilegedFixture(true).summary
    expect(summary.holders).toBe(98)
    expect(summary.assignments).toBe(142)
    expect(summary.byTier).toEqual({ t0: 21, t1: 53, t2: 24 })
    expect(summary.standing).toBe(64)
    expect(summary.jitEligible).toBe(71)
    expect(summary.timeBound).toBe(7)
    expect(summary.overdueReviews).toBe(4)
    expect(summary.neverReviewed).toBe(6)
    expect(summary.reviews.lastCompletedAt).toBe('2026-09-12T00:00:00.000Z')
    expect(summary.reviews.nextDueAt).toBe('2026-12-11T00:00:00.000Z')
    expect(summary.remediationCount).toBe(0)
    expect(summary.findings.find((row) => row.finding_type === 'permanent_tier0')?.title).toBe('Permanent Tier 0 assignment')
    expect(summary.byTierAssignments.t0).toEqual({ holders: 21, permanent: 14, eligible: 13, timeBound: 1 })
    expect(summary.byTierAssignments.t1).toEqual({ holders: 53, permanent: 34, eligible: 31, timeBound: 5 })
    expect(summary.byTierAssignments.t2).toEqual({ holders: 24, permanent: 16, eligible: 27, timeBound: 1 })
    const detail = privilegedFixture(true)
    expect(detail.highestRisk.some((row) => row.displayName === 'Northwind-HR-Sync')).toBe(true)
    expect(detail.highestRisk.some((row) => row.displayName === 'Contoso-HR-Sync')).toBe(false)
    expect(detail.holders.find((row) => row.identityId === 'id-morgan')?.riskScore).toBe(29)
  })

  it('keeps Roles tab counts aligned with Overview Tier 0 mix', () => {
    const detail = privilegedFixture(true)
    const t0 = detail.roles.filter((row) => row.privilegeTier === 0)
    expect(detail.summary.byTier.t0).toBe(21)
    expect(t0.find((row) => row.displayName === 'Global Administrator')).toMatchObject({ holderCount: 1, standingCount: 1, eligibleCount: 0 })
    expect(t0.find((row) => row.displayName === 'Application Administrator')).toMatchObject({ holderCount: 7, standingCount: 5, eligibleCount: 2 })
    expect(t0.find((row) => row.displayName === 'Cloud Application Administrator')).toMatchObject({ holderCount: 5, standingCount: 2, eligibleCount: 3 })
    expect(t0.reduce((sum, row) => sum + row.standingCount, 0)).toBe(detail.summary.byTierAssignments.t0.permanent)
    expect(t0.reduce((sum, row) => sum + row.eligibleCount, 0)).toBe(detail.summary.byTierAssignments.t0.eligible)
  })
})

describe('Fabrikam no-P2 fixture', () => {
  it('uses Fabrikam identities only', () => {
    const detail = privilegedFixture(false)
    expect(detail.holders.every((row) => !row.email?.includes('northwind.example'))).toBe(true)
    expect(detail.holders.some((row) => row.email === 'lee.gu@fabrikam.example')).toBe(true)
    expect(detail.holders.some((row) => row.displayName === 'Northwind-HR-Sync')).toBe(false)
    expect(detail.holders.some((row) => row.displayName === 'Contoso-HR-Sync')).toBe(false)
    expect(detail.summary.holders).toBe(52)
    expect(detail.summary.assignments).toBe(74)
    expect(detail.summary.overdueReviews).toBe(1)
    expect(detail.summary.neverReviewed).toBe(2)
  })
})

describe('review flags match card counts', () => {
  const now = Date.parse('2026-11-21T12:00:00.000Z')

  it('flags only the four overdue Northwind identities', () => {
    const detail = privilegedFixture(true, now)
    const overdueIds = new Set(
      detail.holders.filter((row) => privilegedReviewPastCadence(row.lastReviewedAt, now)).map((row) => row.identityId),
    )
    expect(overdueIds.size).toBe(4)
    expect(overdueIds.size).toBe(detail.summary.overdueReviews)
    const grouped = groupHoldersByIdentity(detail.holders)
    expect(grouped.find((row) => row.displayName === 'Adele Vance')?.roleNames).toEqual([
      'Global Administrator',
      'Helpdesk Administrator',
    ])
  })

  it('flags only Lee as overdue on Fabrikam highest-risk rows', () => {
    const detail = privilegedFixture(false, now)
    const overdueIds = new Set(
      detail.holders.filter((row) => privilegedReviewPastCadence(row.lastReviewedAt, now)).map((row) => row.identityId),
    )
    expect(overdueIds.size).toBe(1)
    expect(overdueIds.size).toBe(detail.summary.overdueReviews)
    const overdueHighest = detail.highestRisk.filter((row) => privilegedReviewPastCadence(row.lastReviewedAt, now))
    expect(overdueHighest).toHaveLength(1)
    expect(overdueHighest[0]?.displayName).toBe('Lee Gu')
  })
})

describe('nextPrivilegedReviewDueAt', () => {
  it('adds 90 days to last completed', () => {
    expect(nextPrivilegedReviewDueAt('2026-08-20T00:00:00.000Z')).toBe('2026-11-18T00:00:00.000Z')
    expect(nextPrivilegedReviewDueAt('2026-09-12T00:00:00.000Z')).toBe('2026-12-11T00:00:00.000Z')
    expect(nextPrivilegedReviewDueAt(null)).toBeNull()
  })
})

describe('privilegedReviewDueOverdue', () => {
  it('uses the same floor-day rule as identity review chips', () => {
    const last = '2026-09-12T00:00:00.000Z'
    const next = nextPrivilegedReviewDueAt(last)!
    const onDueDay = Date.parse('2026-12-11T12:00:00.000Z')
    const dayAfter = Date.parse('2026-12-12T00:00:00.000Z')
    expect(privilegedReviewPastCadence(last, onDueDay)).toBe(false)
    expect(privilegedReviewDueOverdue(next, onDueDay)).toBe(false)
    expect(privilegedReviewPastCadence(last, dayAfter)).toBe(true)
    expect(privilegedReviewDueOverdue(next, dayAfter)).toBe(true)
  })
})

describe('live reviews stay empty', () => {
  it('does not invent fixture dates on the live summary path', () => {
    const summary = summarizePrivileged([identity()], [assignment()], [gaRole], true)
    expect(summary.reviews.lastCompletedAt).toBeNull()
    expect(summary.reviews.nextDueAt).toBeNull()
    expect(summary.reviews.openRequests).toBe(0)
  })
})

describe('mfaMethodLabel', () => {
  it('uses None when methods are missing', () => {
    expect(mfaMethodLabel('human_internal', null)).toBe('None')
    expect(mfaMethodLabel('human_internal', [])).toBe('None')
    expect(mfaMethodLabel('non_human', null)).toBe('n/a')
  })
})

describe('holderIdentifier', () => {
  it('shows truncated app id for service principals', () => {
    expect(
      holderIdentifier({
        identity_class: 'non_human',
        primary_email: 'hr-sync@northwind.example',
        app_id: '7f3c9a12-4d80-4c2e-9a11-0c8e4f00b21e',
      }),
    ).toBe('app id 7f3c…b21e')
  })
})
