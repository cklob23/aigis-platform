import { describe, expect, it, vi } from 'vitest'
import {
  persistGuestRiskUpdates,
  persistIdentityRiskUpdates,
  persistMembershipUpserts,
  persistRiskFindings,
  persistRiskScores,
} from '@/lib/scan/persist'

describe('persistGuestRiskUpdates', () => {
  it('throws when a guest risk update fails', async () => {
    const updateOne = vi.fn(async (row: { id: string }) =>
      row.id === 'g2' ? { error: { message: 'timeout' } } : { error: null },
    )
    await expect(
      persistGuestRiskUpdates(updateOne, [
        { id: 'g1', risk_score: 1, risk_level: 'low', risk_factors: [], recommended_action: 'keep' },
        { id: 'g2', risk_score: 90, risk_level: 'critical', risk_factors: [], recommended_action: 'remove' },
      ]),
    ).rejects.toThrow('guest_identities risk update g2: timeout')
  })
})

describe('persistIdentityRiskUpdates', () => {
  it('throws when a hub risk update fails', async () => {
    const updateOne = vi.fn(async (row: { id: string }) =>
      row.id === 'id-2' ? { error: { message: 'row locked' } } : { error: null },
    )
    await expect(
      persistIdentityRiskUpdates(updateOne, [
        { id: 'id-1', risk_score: 1, risk_level: 'low', recommended_action: 'keep' },
        { id: 'id-2', risk_score: 90, risk_level: 'critical', recommended_action: 'remove' },
      ]),
    ).rejects.toThrow('identities risk update id-2: row locked')
  })
})

describe('persistRiskScores', () => {
  it('throws when a risk_scores batch insert fails', async () => {
    const insertBatch = vi.fn(async () => ({ error: { message: 'fk violation' } }))
    await expect(persistRiskScores(insertBatch, [{ guest_id: 'g1', score: 10 }])).rejects.toThrow('risk_scores insert: fk violation')
  })

  it('accepts identity-only rows and rejects rows with neither key', async () => {
    const insertBatch = vi.fn(async () => ({ error: null }))
    await persistRiskScores(insertBatch, [{ guest_id: null, identity_id: 'i1', score: 4 }])
    expect(insertBatch).toHaveBeenCalledWith([{ guest_id: null, identity_id: 'i1', score: 4 }])
    await expect(persistRiskScores(insertBatch, [{ score: 10 }])).rejects.toThrow(
      'risk_scores insert: guest_id or identity_id is required',
    )
  })
})

describe('persistRiskFindings', () => {
  it('throws when resolving open findings fails, before insert', async () => {
    const insertBatch = vi.fn(async () => ({ error: null }))
    await expect(
      persistRiskFindings(async () => ({ error: { message: 'could not update' } }), insertBatch, [{ title: 'x' }]),
    ).rejects.toThrow('risk_findings resolve open: could not update')
    expect(insertBatch).not.toHaveBeenCalled()
  })

  it('throws when inserting findings fails', async () => {
    await expect(
      persistRiskFindings(
        async () => ({ error: null }),
        async () => ({ error: { message: 'batch too large' } }),
        [{ title: 'x' }],
      ),
    ).rejects.toThrow('risk_findings insert: batch too large')
  })
})

describe('persistMembershipUpserts', () => {
  it('throws when membership upsert fails and does not soft-remove', async () => {
    const removeGone = vi.fn(async () => ({ error: null }))
    await expect(
      persistMembershipUpserts(async () => ({ error: { message: 'on conflict failed' } }), removeGone, [{ guest_id: 'g' }], ['m1']),
    ).rejects.toThrow('resource_memberships upsert: on conflict failed')
    expect(removeGone).not.toHaveBeenCalled()
  })

  it('throws when soft-remove fails after a successful upsert', async () => {
    await expect(
      persistMembershipUpserts(
        async () => ({ error: null }),
        async () => ({ error: { message: 'in clause empty' } }),
        [{ guest_id: 'g' }],
        ['m1'],
      ),
    ).rejects.toThrow('resource_memberships soft-remove: in clause empty')
  })
})
