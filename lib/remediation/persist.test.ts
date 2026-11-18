import { describe, expect, it, vi } from 'vitest'
import { persistRemediationEffects, requireRemediationAction } from '@/lib/remediation/persist'

describe('requireRemediationAction', () => {
  it('throws when the action insert is unchecked-success today (error set)', () => {
    expect(() => requireRemediationAction({ error: { message: 'not null' }, data: null })).toThrow(
      'remediation_actions insert: not null',
    )
  })

  it('returns the id on success', () => {
    expect(requireRemediationAction({ error: null, data: { id: 'act-1' } })).toEqual({ id: 'act-1' })
  })
})

describe('persistRemediationEffects', () => {
  it('marks the action failed when a later write fails', async () => {
    const markFailed = vi.fn(async () => ({ error: null }))
    await expect(
      persistRemediationEffects(
        [
          { label: 'resource_memberships soft-remove', run: async () => ({ error: null }) },
          { label: 'guest_activity insert', run: async () => ({ error: { message: 'fk missing' } }) },
        ],
        markFailed,
      ),
    ).rejects.toThrow('guest_activity insert: fk missing')
    expect(markFailed).toHaveBeenCalledWith('guest_activity insert: fk missing')
  })

  it('still throws the original write error if marking failed also fails', async () => {
    await expect(
      persistRemediationEffects(
        [{ label: 'guest_activity insert', run: async () => ({ error: { message: 'fk missing' } }) }],
        async () => {
          throw new Error('could not mark failed')
        },
      ),
    ).rejects.toThrow('guest_activity insert: fk missing')
  })
})
