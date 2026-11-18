import { describe, expect, it, vi } from 'vitest'
import { mustWrite, mustWriteOrRollback, WriteFailedError } from '@/lib/supabase/write'

describe('mustWrite', () => {
  it('returns the result when error is null', () => {
    const result = { error: null, data: { id: '1' } }
    expect(mustWrite('alerts insert', result)).toBe(result)
  })

  it('throws a labeled error when supabase reports a write failure', () => {
    expect(() => mustWrite('risk_scores insert', { error: { message: 'duplicate key' } })).toThrow(WriteFailedError)
    expect(() => mustWrite('risk_scores insert', { error: { message: 'duplicate key' } })).toThrow(
      'risk_scores insert: duplicate key',
    )
  })
})

describe('mustWriteOrRollback', () => {
  it('does not roll back a successful write', async () => {
    const rollback = vi.fn(async () => ({ error: null }))
    const result = { error: null, data: [{ id: 'a' }] }
    await expect(mustWriteOrRollback('review_items insert', result, rollback)).resolves.toBe(result)
    expect(rollback).not.toHaveBeenCalled()
  })

  it('rolls back then throws the original write error', async () => {
    const rollback = vi.fn(async () => ({ error: null }))
    await expect(
      mustWriteOrRollback('review_items insert', { error: { message: 'null identity_id' } }, rollback),
    ).rejects.toThrow('review_items insert: null identity_id')
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('still throws the write error if rollback itself fails', async () => {
    const rollback = vi.fn(async () => {
      throw new Error('delete failed')
    })
    await expect(
      mustWriteOrRollback('review_items insert', { error: { message: 'check constraint' } }, rollback),
    ).rejects.toThrow('review_items insert: check constraint')
  })
})
