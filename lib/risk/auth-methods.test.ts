import { describe, expect, it } from 'vitest'
import { authMethodsFromGraphFailure, authMethodsFromGraphValue, authMethodsStatus, describeAuthMethods } from '@/lib/risk/auth-methods'
import { computeRisk, type RiskInput } from '@/lib/risk/engine'

const NOW = Date.parse('2026-11-18T00:00:00.000Z')

function input(partial: Partial<RiskInput> = {}): RiskInput {
  return {
    accountEnabled: true,
    invitationStatus: 'Accepted',
    createdAt: '2025-01-01T00:00:00.000Z',
    lastSignInAt: '2026-11-01T00:00:00.000Z',
    lastNonInteractiveSignInAt: null,
    authMethods: [],
    hasSponsor: true,
    sponsorEnabled: true,
    domainClassification: 'vendor',
    lastReviewedAt: '2026-06-01T00:00:00.000Z',
    memberships: [{ isSensitive: false, isOwner: false, type: 'member' }],
    ...partial,
  }
}

describe('authMethodsStatus', () => {
  it('treats an empty list as unknown unless the fetch completed', () => {
    expect(authMethodsStatus([])).toBe('unknown')
    expect(authMethodsStatus(null)).toBe('unknown')
    expect(authMethodsStatus([], false)).toBe('unknown')
    expect(authMethodsStatus([], true)).toBe('none')
    expect(authMethodsStatus(['microsoftAuthenticatorAuthenticationMethod'])).toBe('present')
  })
})

describe('Graph 403 is unknown, not no MFA', () => {
  it('maps a forbidden methods call to known: false', () => {
    expect(authMethodsFromGraphFailure({ status: 403, code: 'Authorization_RequestDenied' })).toEqual({
      known: false,
      methods: [],
      reason: 'Graph 403 Authorization_RequestDenied',
    })
    expect(authMethodsFromGraphValue([])).toEqual({ known: true, methods: [] })
  })
})

describe('describeAuthMethods', () => {
  it('shows Unknown for the live default empty array', () => {
    expect(describeAuthMethods([]).label).toBe('Unknown')
    expect(describeAuthMethods([], true).label).toBe('None registered')
  })
})

describe('no_mfa scoring', () => {
  it('does not add +6 when MFA status is unknown', () => {
    const risk = computeRisk(input({ authMethods: [] }), undefined, NOW)
    expect(risk.factors.some((f) => f.key === 'no_mfa')).toBe(false)
    expect(risk.factors.find((f) => f.key === 'mfa_unknown')).toEqual({
      key: 'mfa_unknown',
      label: 'MFA status unknown',
      points: 0,
      detail: 'Authentication methods were not inventoried',
    })
  })

  it('adds +6 only after a completed fetch returns no methods', () => {
    const risk = computeRisk(input({ authMethods: [], authMethodsKnown: true }), undefined, NOW)
    expect(risk.factors.find((f) => f.key === 'no_mfa')).toMatchObject({ key: 'no_mfa', points: 6 })
    expect(risk.factors.some((f) => f.key === 'mfa_unknown')).toBe(false)
  })

  it('does not score MFA when methods are present', () => {
    const risk = computeRisk(input({ authMethods: ['phoneAuthenticationMethod'] }), undefined, NOW)
    expect(risk.factors.some((f) => f.key === 'no_mfa' || f.key === 'mfa_unknown')).toBe(false)
  })
})
