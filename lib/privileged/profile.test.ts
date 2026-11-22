import { describe, expect, it } from 'vitest'
import { activationApprovalLabel, directoryScopeLabel, parseStoredActivations, publicActivation } from '@/lib/privileged/profile'
import { privilegedDemoAdeleProfile, privilegedProfileFixture } from '@/lib/privileged/fixtures'

describe('directoryScopeLabel', () => {
  it('labels tenant and administrative units', () => {
    expect(directoryScopeLabel('/')).toBe('Tenant')
    expect(directoryScopeLabel('/administrativeUnits/au-northwind-clinics')).toBe('Administrative unit · au-northwind-clinics')
  })
})

describe('publicActivation', () => {
  it('drops justification', () => {
    const row = publicActivation({
      id: 'a1',
      roleName: 'Global Administrator',
      activatedAt: '2026-11-18T00:00:00.000Z',
      durationMinutes: 30,
      result: 'success',
      ticket: 'T-1',
      justification: 'secret reason',
    })
    expect(JSON.stringify(row)).not.toMatch(/justification/i)
    expect(JSON.stringify(row)).not.toContain('secret')
  })
})

describe('parseStoredActivations', () => {
  it('ignores justification on stored JSON', () => {
    const rows = parseStoredActivations([
      {
        id: 'a1',
        roleName: 'Global Administrator',
        activatedAt: '2026-11-18T00:00:00.000Z',
        durationMinutes: 30,
        result: 'success',
        ticket: null,
        justification: 'do not leak',
      },
    ])
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain('do not leak')
  })
})

describe('privilegedProfileFixture', () => {
  it('builds a P2 Lee Gu profile with activations and no justification text', () => {
    const profile = privilegedProfileFixture(true)
    expect(profile.displayName).toBe('Lee Gu')
    expect(profile.pimAvailable).toBe(true)
    expect(profile.activations.length).toBeGreaterThan(0)
    expect(profile.factors.map((f) => f.key)).toContain('tier0_role')
    expect(profile.factors.map((f) => f.key)).toContain('privileged_review_overdue')
    expect(profile.factors.map((f) => f.key)).not.toContain('permanent_tier0')
    expect(profile.factors.map((f) => f.key)).not.toContain('eligible_not_activated')
    expect(profile.assignments.find((row) => row.roleName === 'Privileged Role Administrator')?.state).toBe('eligible')
    expect(JSON.stringify(profile)).not.toMatch(/justification/i)
    expect(JSON.stringify(profile)).not.toContain('Emergency break-glass')
    expect(profile.entraUrl).toContain('AssignedRoles')
  })

  it('hides activations when PIM is unavailable', () => {
    const profile = privilegedProfileFixture(false)
    expect(profile.pimAvailable).toBe(false)
    expect(profile.activations).toEqual([])
  })
})

describe('activationApprovalLabel', () => {
  it('shows the stored approval text without inventing a 2-approver rule', () => {
    expect(
      activationApprovalLabel({ roleName: 'Privileged Role Administrator', approval: 'Approved' }),
    ).toBe('Approved')
    expect(
      activationApprovalLabel({ roleName: 'Global Administrator', approval: 'Approved', approverNames: [] }),
    ).toBe('Approved')
  })

  it('uses recorded approver names when present', () => {
    expect(
      activationApprovalLabel({
        roleName: 'Privileged Role Administrator',
        approval: 'Approved',
        approverNames: ['Alex Wilber'],
      }),
    ).toBe('Alex Wilber')
  })

  it('falls back to None when no approval was stored', () => {
    expect(activationApprovalLabel({ roleName: 'User Administrator', approval: 'Approved' })).toBe('Approved')
    expect(activationApprovalLabel({ roleName: 'Global Administrator', approval: null })).toBe('None')
  })
})

describe('buildPrivilegedProfile', () => {
  it('keeps excluded roles off the assignment list', () => {
    const profile = privilegedProfileFixture(true, 'id-adele')
    expect(profile.assignments.some((row) => row.roleName === 'Directory Readers')).toBe(false)
    expect(profile.assignments.filter((row) => row.roleName === 'Global Administrator')).toHaveLength(1)
    expect(profile.assignments.find((row) => row.roleName === 'Global Administrator')?.state).toBe('permanent')
    expect(profile.assignments.some((row) => row.roleName === 'Global Administrator')).toBe(true)
  })
})

describe('privilegedDemoAdeleProfile', () => {
  it('uses Northwind Adele Admin demo data without activation justifications', () => {
    const profile = privilegedDemoAdeleProfile(true)
    expect(profile.displayName).toBe('Adele Admin')
    expect(profile.identifier).toBe('adele.admin@contoso.example')
    expect(profile.riskScore).toBe(profile.factors.reduce((sum, f) => sum + f.points, 0))
    expect(profile.assignments.filter((row) => row.roleName === 'Global Administrator')).toHaveLength(1)
    expect(profile.assignments.find((row) => row.roleName === 'Global Administrator')?.recommendedChange).toBe(
      'convert_to_eligible',
    )
    expect(profile.assignments.find((row) => row.roleName === 'Privileged Role Administrator')?.recommendedChange).toBeNull()
    expect(profile.assignments.some((row) => row.recommendedChange === 'reduce_scope')).toBe(false)
    expect(profile.assignments.some((row) => row.roleName === 'Privileged Role Administrator' && row.state === 'eligible')).toBe(true)
    expect(profile.activations.some((row) => row.roleName === 'Privileged Role Administrator')).toBe(true)
    expect(profile.factors.map((f) => f.key)).not.toContain('eligible_not_activated')
    expect(profile.activations.some((row) => row.roleName === 'Global Administrator')).toBe(false)
    expect(profile.nextPrivilegedReviewAt).toBe('2026-12-11T00:00:00.000Z')
    expect(profile.assignments.some((row) => row.entraUrl?.includes('roleId/'))).toBe(true)
    expect(JSON.stringify(profile)).not.toMatch(/justification/i)
    expect(JSON.stringify(profile)).not.toContain('Do not cite')
  })

  it('does not call standing-permanent Tier 0 without P2', () => {
    const profile = privilegedDemoAdeleProfile(false)
    expect(profile.factors.some((f) => f.label.includes('P2 needed'))).toBe(true)
    expect(profile.factors.some((f) => /Standing \(permanent\)/.test(f.label))).toBe(false)
    expect(profile.riskScore).toBe(profile.factors.reduce((sum, f) => sum + f.points, 0))
    expect(profile.activations).toEqual([])
  })
})
