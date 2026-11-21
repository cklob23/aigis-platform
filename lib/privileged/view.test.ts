import { describe, expect, it } from 'vitest'
import { requirePrivilegedDetail } from '@/lib/auth/rbac'
import {
  assignmentState,
  buildPrivilegedHolders,
  buildPrivilegedRoles,
  combinedStateLabel,
  filterHolders,
  summarizePrivileged,
  summaryHasIdentityNames,
  type PrivilegedAssignmentRow,
  type PrivilegedIdentityRow,
  type PrivilegedRoleRow,
} from '@/lib/privileged/view'
import { privilegedFixture } from '@/lib/privileged/fixtures'
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
  })
})
