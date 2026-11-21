import { describe, expect, it } from 'vitest'
import { requirePrivilegedDetail } from '@/lib/auth/rbac'
import {
  assignmentState,
  buildPrivilegedHolders,
  filterHolders,
  summarizePrivileged,
  summaryHasIdentityNames,
  type PrivilegedAssignmentRow,
  type PrivilegedIdentityRow,
} from '@/lib/privileged/view'
import { privilegedFixture } from '@/lib/privileged/fixtures'
import { canExportPrivileged } from '@/lib/auth/rbac'

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
    const summary = summarizePrivileged(identities, [assignment(), assignment({ id: 'asg-2', principal_identity_id: 'id-2' })], true)
    expect(summary.holders).toBe(2)
    expect(summary.byTier.t0).toBe(1)
    expect(summary.byTier.t1).toBe(1)
    expect(summaryHasIdentityNames(summary, identities)).toBe(false)
    expect(JSON.stringify(summary)).not.toContain('Adele')
    expect(JSON.stringify(summary)).not.toContain('Megan')
    expect(JSON.stringify(summary)).not.toContain('northwind.example')
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
    expect(guests).toHaveLength(1)
    expect(guests[0]?.displayName).toBe('Fabrikam Vendor')
    expect(filterHolders(detail.holders, { tier: '0' }).every((row) => row.privilegeTier === 0)).toBe(true)
  })
})

describe('buildPrivilegedHolders', () => {
  it('keeps names only on the detail path', () => {
    const holders = buildPrivilegedHolders(
      [identity()],
      [assignment()],
      [{ id: 'role-ga', display_name: 'Global Administrator', privilege_tier: 0, is_privileged: true, is_built_in: true, description: null }],
      true,
    )
    expect(holders[0]?.displayName).toBe('Adele Admin')
  })
})
