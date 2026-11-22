import { describe, expect, it } from 'vitest'
import { directoryScopeLabel, parseStoredActivations, publicActivation } from '@/lib/privileged/profile'
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
    expect(profile.factors.map((f) => f.key)).toContain('permanent_tier0')
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

describe('buildPrivilegedProfile', () => {
  it('keeps excluded roles off the assignment list', () => {
    const profile = privilegedProfileFixture(true, 'id-adele')
    expect(profile.assignments.some((row) => row.roleName === 'Directory Readers')).toBe(false)
    expect(profile.assignments.some((row) => row.roleName === 'Global Administrator')).toBe(true)
  })
})

describe('privilegedDemoAdeleProfile', () => {
  it('uses Contoso Adele Admin demo data without activation justifications', () => {
    const profile = privilegedDemoAdeleProfile(true)
    expect(profile.displayName).toBe('Adele Admin')
    expect(profile.identifier).toBe('adele.admin@contoso.example')
    expect(profile.activations.some((row) => row.roleName === 'Global Administrator')).toBe(true)
    expect(profile.assignments.some((row) => row.entraUrl?.includes('roleId/'))).toBe(true)
    expect(JSON.stringify(profile)).not.toMatch(/justification/i)
    expect(JSON.stringify(profile)).not.toContain('Do not cite')
  })
})
