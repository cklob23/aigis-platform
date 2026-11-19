import { describe, expect, it } from 'vitest'
import {
  accountIdForIdentityId,
  identityIdForGuestId,
  mapsFromRows,
  requireIdentityId,
  withIdentityId,
  withMembershipIds,
} from '@/lib/identity/governance'

const guests = [
  { id: 'g1', identity_id: 'i1' },
  { id: 'g2', identity_id: 'i2' },
]
const accounts = [
  { id: 'a1', identity_id: 'i1' },
  { id: 'a2', identity_id: 'i2' },
]
const maps = mapsFromRows({ guests, accounts })

describe('requireIdentityId', () => {
  it('returns identity_id when present', () => {
    expect(requireIdentityId({ id: 'g1', identity_id: 'i1' })).toBe('i1')
  })

  it('accepts identity-only rows without a guest id', () => {
    expect(requireIdentityId({ identity_id: 'i9' })).toBe('i9')
    expect(requireIdentityId({ guest_id: null, identity_id: 'i9' })).toBe('i9')
  })

  it('fails closed without identity_id', () => {
    expect(() => requireIdentityId({ id: 'g1', identity_id: null })).toThrow(/missing identity_id/)
    expect(() => requireIdentityId({ identity_id: null })).toThrow(/missing identity_id/)
  })
})

describe('withIdentityId', () => {
  it('copies identity_id from the guest map and keeps tenant_id', () => {
    const row = withIdentityId({ tenant_id: 't1', guest_id: 'g1', score: 9 }, maps)
    expect(row).toEqual({ tenant_id: 't1', guest_id: 'g1', score: 9, identity_id: 'i1' })
  })

  it('leaves identity_id null when guest_id is null (tenant-level alerts)', () => {
    expect(withIdentityId({ tenant_id: 't1', guest_id: null, title: 'scan failed' }, maps).identity_id).toBeNull()
  })

  it('keeps identity_id on identity-only rows', () => {
    expect(withIdentityId({ tenant_id: 't1', guest_id: null, identity_id: 'i9', score: 4 }, maps)).toEqual({
      tenant_id: 't1',
      guest_id: null,
      identity_id: 'i9',
      score: 4,
    })
  })

  it('fails closed when the guest is not in the map', () => {
    expect(() => withIdentityId({ guest_id: 'missing' }, maps)).toThrow(/missing identity_id/)
  })
})

describe('withMembershipIds', () => {
  it('adds identity_id and entra account_id, keeping guest_id', () => {
    expect(withMembershipIds({ tenant_id: 't1', guest_id: 'g2', resource_id: 'r1' }, maps)).toEqual({
      tenant_id: 't1',
      guest_id: 'g2',
      resource_id: 'r1',
      identity_id: 'i2',
      account_id: 'a2',
    })
  })

  it('fails closed without an entra account', () => {
    const incomplete = mapsFromRows({ guests, accounts: [{ id: 'a1', identity_id: 'i1' }] })
    expect(() => withMembershipIds({ guest_id: 'g2' }, incomplete)).toThrow(/missing an entra account/)
  })
})

describe('identityIdForGuestId / accountIdForIdentityId', () => {
  it('returns null for a missing guest_id', () => {
    expect(identityIdForGuestId(null, maps)).toBeNull()
    expect(identityIdForGuestId(undefined, maps)).toBeNull()
  })

  it('fails closed without an account for the identity', () => {
    expect(() => accountIdForIdentityId('missing', maps)).toThrow(/missing an entra account/)
  })
})
