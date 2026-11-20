import { describe, expect, it } from 'vitest'
import { computeIdentityRisk, DEFAULT_RISK_POLICY } from '@/lib/risk/engine'
import { membershipsByGuestForRisk, planMembershipReconcile } from '@/lib/scan/memberships'

function pad(n: number) {
  return String(n).padStart(4, '0')
}

function priorRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m-${pad(i + 1)}`,
    guest_id: `g-${pad(Math.floor(i / 5) + 1)}`,
    resource_id: `r-${pad((i % 40) + 1)}`,
  }))
}

describe('planMembershipReconcile', () => {
  it('does not soft-remove rows past the first 1000 when the full prior set is loaded', () => {
    const prior = priorRows(2500)
    const incoming = prior.map((row) => ({ guest_id: row.guest_id, resource_id: row.resource_id }))
    const plan = planMembershipReconcile(prior, incoming)
    expect(prior).toHaveLength(2500)
    expect(plan.removedIds).toEqual([])
    expect(plan.newCount).toBe(0)
    expect(plan.removedIds).not.toContain('m-1001')
    expect(plan.removedIds).not.toContain('m-2500')
  })

  it('treats later-page prior rows as new if only the first 1000 prior rows load', () => {
    const prior = priorRows(2500)
    const incoming = prior.map((row) => ({ guest_id: row.guest_id, resource_id: row.resource_id }))
    const truncated = planMembershipReconcile(prior.slice(0, 1000), incoming)
    expect(truncated.removedIds).toEqual([])
    expect(truncated.newCount).toBe(1500)
    const full = planMembershipReconcile(prior, incoming)
    expect(full.newCount).toBe(0)
    expect(full.removedIds).toEqual([])
  })
})

describe('membershipsByGuestForRisk', () => {
  it('keeps disabled_with_access for a disabled guest whose memberships sit past the first page', () => {
    const memberships = Array.from({ length: 2500 }, (_, i) => ({
      guest_id: i >= 2400 ? 'disabled-guest' : `g-${pad(i + 1)}`,
      resource_id: `r-${pad((i % 40) + 1)}`,
      membership_type: 'member',
    }))
    const resourceMap = new Map(
      Array.from({ length: 40 }, (_, i) => [
        `r-${pad(i + 1)}`,
        { is_sensitive: false, resource_type: 'security_group' },
      ]),
    )
    const byGuest = membershipsByGuestForRisk(memberships, resourceMap)
    expect(memberships).toHaveLength(2500)
    expect(byGuest.get('disabled-guest')?.length).toBe(100)
    const firstPageOnly = membershipsByGuestForRisk(memberships.slice(0, 1000), resourceMap)
    expect(firstPageOnly.get('disabled-guest')).toBeUndefined()

    const risk = computeIdentityRisk(
      'external',
      {
        accountEnabled: false,
        invitationStatus: 'Accepted',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastSignInAt: '2026-01-01T00:00:00.000Z',
        authMethods: ['password'],
        hasSponsor: true,
        sponsorEnabled: true,
        domainClassification: 'vendor',
        lastReviewedAt: '2026-01-01T00:00:00.000Z',
        memberships: byGuest.get('disabled-guest') ?? [],
      },
      DEFAULT_RISK_POLICY,
    )
    expect(risk.factors.some((factor) => factor.key === 'disabled_with_access')).toBe(true)

    const missed = computeIdentityRisk(
      'external',
      {
        accountEnabled: false,
        invitationStatus: 'Accepted',
        createdAt: '2024-01-01T00:00:00.000Z',
        lastSignInAt: '2026-01-01T00:00:00.000Z',
        authMethods: ['password'],
        hasSponsor: true,
        sponsorEnabled: true,
        domainClassification: 'vendor',
        lastReviewedAt: '2026-01-01T00:00:00.000Z',
        memberships: firstPageOnly.get('disabled-guest') ?? [],
      },
      DEFAULT_RISK_POLICY,
    )
    expect(missed.factors.some((factor) => factor.key === 'disabled_with_access')).toBe(false)
  })
})
