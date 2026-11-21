import { describe, expect, it } from 'vitest'
import { DEFAULT_RISK_POLICY } from '@/lib/risk/engine'
import { planPrivilegedRiskOverlay, type OverlayIdentityRow } from '@/lib/scan/privileged-risk'

const NOW = Date.parse('2026-11-18T00:00:00.000Z')
const TENANT = 'tenant-1'

function identity(partial: Partial<OverlayIdentityRow> & { id: string }): OverlayIdentityRow {
  return {
    is_privileged: false,
    privilege_tier: null,
    status: 'active',
    last_activity_at: '2026-11-01T00:00:00.000Z',
    first_seen_at: '2025-01-01T00:00:00.000Z',
    risk_score: 0,
    risk_level: 'low',
    recommended_action: 'keep',
    ...partial,
  }
}

describe('planPrivilegedRiskOverlay', () => {
  it('clears leftover overlay scores when the flag is off and writes nothing to risk_scores', () => {
    const plan = planPrivilegedRiskOverlay({
      tenantId: TENANT,
      scanJobId: null,
      identities: [
        identity({ id: 'keep-zero' }),
        identity({ id: 'stale', risk_score: 56, risk_level: 'high', recommended_action: 'review' }),
      ],
      accounts: [],
      assignments: [],
      roles: [],
      groupEligibilities: [],
      policy: DEFAULT_RISK_POLICY,
      activityKnown: true,
      overlayOn: false,
      now: NOW,
    })
    expect(plan.identityUpdates).toEqual([
      { id: 'stale', risk_score: 0, risk_level: 'low', recommended_action: 'keep', risk_factors: [] },
    ])
    expect(plan.scoreRows).toEqual([])
  })

  it('scores a privileged identity past the first 1000 rows', () => {
    const identities = Array.from({ length: 1001 }, (_, i) =>
      identity({
        id: `id-${String(i + 1).padStart(4, '0')}`,
        is_privileged: i === 1000,
        privilege_tier: i === 1000 ? 0 : null,
      }),
    )
    const plan = planPrivilegedRiskOverlay({
      tenantId: TENANT,
      scanJobId: 'scan-1',
      identities,
      accounts: identities.map((row) => ({ identity_id: row.id, enabled: true, last_activity_at: row.last_activity_at })),
      assignments: [
        {
          principal_identity_id: 'id-1001',
          directory_role_id: 'role-ga',
          assignment_type: 'active',
        },
      ],
      roles: [{ id: 'role-ga', is_privileged: true }],
      groupEligibilities: [],
      policy: DEFAULT_RISK_POLICY,
      activityKnown: true,
      overlayOn: true,
      now: NOW,
    })
    expect(plan.identityUpdates).toHaveLength(1001)
    const first = plan.identityUpdates[0]
    const last = plan.identityUpdates[1000]
    expect(first?.id).toBe('id-0001')
    expect(first?.risk_score).toBe(0)
    expect(last?.id).toBe('id-1001')
    expect(last?.risk_score).toBe(56)
    expect(last?.recommended_action).toBe('review')
    expect(plan.scoreRows[1000]).toMatchObject({
      tenant_id: TENANT,
      guest_id: null,
      identity_id: 'id-1001',
      score: 56,
    })
  })

  it('uses identity-only risk_scores rows', () => {
    const plan = planPrivilegedRiskOverlay({
      tenantId: TENANT,
      scanJobId: null,
      identities: [identity({ id: 'adele', is_privileged: true, privilege_tier: 0 })],
      accounts: [{ identity_id: 'adele', enabled: true, last_activity_at: '2026-11-01T00:00:00.000Z' }],
      assignments: [{ principal_identity_id: 'adele', directory_role_id: 'ga', assignment_type: 'active' }],
      roles: [{ id: 'ga', is_privileged: true }],
      groupEligibilities: [{ principal_identity_id: 'adele', access_id: 'owner' }],
      policy: DEFAULT_RISK_POLICY,
      activityKnown: true,
      overlayOn: true,
      now: NOW,
    })
    expect(plan.scoreRows[0]?.guest_id).toBeNull()
    expect(plan.identityUpdates[0]?.risk_factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'privilege_t0' }),
        expect.objectContaining({ key: 'standing_privileged' }),
        expect.objectContaining({ key: 'group_pim_owner' }),
      ]),
    )
  })
})
