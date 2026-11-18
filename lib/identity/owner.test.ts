import { describe, expect, it } from 'vitest'
import { describeOwner } from '@/lib/identity/owner'

const none = {
  owner_kind: 'none' as const,
  owner_identity_id: null,
  owner_display_name: null,
  owner_email: null,
  owner_ms_object_id: null,
}

describe('describeOwner', () => {
  it('is none when no owner fields are set', () => {
    expect(describeOwner(none)).toEqual({ kind: 'none', label: 'None', email: null, href: null, resolved: false })
  })

  it('shows an unresolved sponsor by name and email without minting an identity', () => {
    expect(
      describeOwner({
        owner_kind: 'sponsor',
        owner_identity_id: null,
        owner_display_name: 'Pat Sponsor',
        owner_email: 'pat@contoso.example',
        owner_ms_object_id: 'internal-oid',
      }),
    ).toEqual({
      kind: 'sponsor',
      label: 'Pat Sponsor',
      email: 'pat@contoso.example',
      href: null,
      resolved: false,
    })
  })

  it('links to the inventoried owner guest when owner_identity_id resolves', () => {
    expect(
      describeOwner(
        {
          owner_kind: 'sponsor',
          owner_identity_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          owner_display_name: 'A',
          owner_email: 'a@ex.example',
          owner_ms_object_id: 'oid-a',
        },
        { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', display_name: 'Guest A', email: 'a@ex.example' },
      ),
    ).toEqual({
      kind: 'sponsor',
      label: 'Guest A',
      email: 'a@ex.example',
      href: '/guests/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      resolved: true,
    })
  })
})
