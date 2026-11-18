import { describe, expect, it, vi } from 'vitest'
import { persistGuestRiskUpdates, persistMembershipUpserts, persistRiskFindings, persistRiskScores } from '@/lib/scan/persist'

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

describe('persistRiskScores', () => {
  it('throws when a risk_scores batch insert fails', async () => {
    const insertBatch = vi.fn(async () => ({ error: { message: 'fk violation' } }))
    await expect(persistRiskScores(insertBatch, [{ score: 10 }])).rejects.toThrow('risk_scores insert: fk violation')
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
