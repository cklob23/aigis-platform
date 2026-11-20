import { describe, expect, it } from 'vitest'
import { asExternalGuest, planGuestInventory, planInternalInventory, type IncomingExternalGuest } from '@/lib/identity/ingest'
import { CONTOSO_INTERNAL_USERS } from '@/lib/demo/internal-users'
import type { Guest } from '@/lib/types'

const tenantId = '00000000-0000-0000-0000-000000000010'
const now = '2026-11-18T00:00:00.000Z'

function incoming(partial: Partial<IncomingExternalGuest> & Pick<IncomingExternalGuest, 'ms_object_id'>): IncomingExternalGuest {
  return {
    display_name: partial.display_name ?? 'Guest',
    email: partial.email ?? `${partial.ms_object_id}@ex.example`,
    upn: partial.upn ?? `${partial.ms_object_id}#EXT#`,
    domain: partial.domain ?? 'ex.example',
    external_domain_id: partial.external_domain_id ?? null,
    external_organization_id: partial.external_organization_id ?? null,
    external_type: partial.external_type ?? 'b2b_guest',
    classification_evidence: partial.classification_evidence ?? [],
    company_name: partial.company_name ?? null,
    company_source: partial.company_source ?? null,
    account_enabled: partial.account_enabled ?? true,
    invitation_status: partial.invitation_status ?? 'Accepted',
    user_type: partial.user_type ?? 'Guest',
    created_at_ms: partial.created_at_ms ?? null,
    last_sign_in_at: partial.last_sign_in_at ?? null,
    last_non_interactive_sign_in_at: partial.last_non_interactive_sign_in_at ?? null,
    sponsor_ms_object_id: partial.sponsor_ms_object_id ?? null,
    sponsor_display_name: partial.sponsor_display_name ?? null,
    sponsor_email: partial.sponsor_email ?? null,
    sponsor_enabled: partial.sponsor_enabled ?? null,
    ...partial,
    ms_object_id: partial.ms_object_id,
    identity_class: 'external',
  }
}

describe('planGuestInventory', () => {
  it('creates matching hub, entra account, and guest rows for a new identity', () => {
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [incoming({ ms_object_id: 'oid-new', display_name: 'New Guest' })],
      existing: [],
      generateId: () => '11111111-1111-1111-1111-111111111111',
    })
    expect(plan.newCount).toBe(1)
    expect(plan.guests).toHaveLength(1)
    expect(plan.guests[0].id).toBe('11111111-1111-1111-1111-111111111111')
    expect(plan.guests[0].identity_id).toBe(plan.guests[0].id)
    expect(plan.identities[0].id).toBe(plan.guests[0].identity_id)
    expect(plan.identities[0].identity_class).toBe('external')
    expect(plan.identities[0].owner_identity_id).toBeNull()
    expect(plan.identities[0]).not.toHaveProperty('first_seen_at')
    expect(plan.identities[0]).not.toHaveProperty('risk_score')
    expect(plan.identities[0]).not.toHaveProperty('risk_level')
    expect(plan.identities[0]).not.toHaveProperty('recommended_action')
    expect(plan.identities[0]).not.toHaveProperty('review_status')
    expect(plan.identities[0]).not.toHaveProperty('last_reviewed_at')
    expect(plan.accounts[0].source).toBe('entra')
    expect(plan.accounts[0].source_object_id).toBe('oid-new')
    expect(plan.accounts[0].identity_id).toBe(plan.guests[0].identity_id)
    expect(plan.relations).toEqual([])
    expect(plan.removedGuestIds).toEqual([])
  })

  it('reuses existing guest and identity ids on rescan', () => {
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [incoming({ ms_object_id: 'oid-1', display_name: 'Ada' })],
      existing: [{ id: 'gid-1', ms_object_id: 'oid-1', identity_id: 'gid-1', removed_at: null }],
      generateId: () => 'should-not-run',
    })
    expect(plan.newCount).toBe(0)
    expect(plan.guests[0].id).toBe('gid-1')
    expect(plan.guests[0].identity_id).toBe('gid-1')
    expect(plan.identities[0].id).toBe('gid-1')
  })

  it('fails closed when an existing guest is missing identity_id', () => {
    expect(() =>
      planGuestInventory({
        tenantId,
        now,
        incoming: [incoming({ ms_object_id: 'oid-1' })],
        existing: [{ id: 'gid-1', ms_object_id: 'oid-1', identity_id: null, removed_at: null }],
      }),
    ).toThrow(/missing identity_id/)
  })

  it('fails closed when a disappearing guest is missing identity_id', () => {
    expect(() =>
      planGuestInventory({
        tenantId,
        now,
        incoming: [],
        existing: [{ id: 'gid-gone', ms_object_id: 'oid-gone', identity_id: null, removed_at: null }],
      }),
    ).toThrow(/missing identity_id/)
  })

  it('soft-removes guests that disappeared, keeping guest_id for dual-write', () => {
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [incoming({ ms_object_id: 'oid-keep' })],
      existing: [
        { id: 'keep', ms_object_id: 'oid-keep', identity_id: 'keep', removed_at: null },
        { id: 'gone', ms_object_id: 'oid-gone', identity_id: 'gone', removed_at: null },
        { id: 'already', ms_object_id: 'oid-already', identity_id: 'already', removed_at: '2026-01-01T00:00:00.000Z' },
      ],
      generateId: () => 'keep',
    })
    expect(plan.removedGuestIds).toEqual(['gone'])
    expect(plan.removedIdentityIds).toEqual(['gone'])
    expect(plan.guests.map((g) => g.ms_object_id)).toEqual(['oid-keep'])
  })

})

describe('planGuestInventory sponsor relations', () => {
  it('links B→A when A is in the same inventory and skips internal-only sponsors', () => {
    let n = 0
    const ids = [
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    ]
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({ ms_object_id: 'oid-a', display_name: 'A' }),
        incoming({
          ms_object_id: 'oid-b',
          display_name: 'B',
          sponsor_ms_object_id: 'oid-a',
          sponsor_email: 'a@ex.example',
          sponsor_display_name: 'A',
        }),
        incoming({
          ms_object_id: 'oid-c',
          display_name: 'C',
          sponsor_ms_object_id: 'internal-oid',
          sponsor_email: 'pat@contoso.example',
        }),
      ],
      existing: [],
      generateId: () => ids[n++]!,
    })
    expect(plan.relations).toEqual([
      {
        tenant_id: tenantId,
        from_identity_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        to_identity_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        relation_type: 'sponsors',
      },
    ])
    expect(plan.identities.every((row) => row.identity_class === 'external')).toBe(true)
    const a = plan.identities.find((row) => row.id === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    const b = plan.identities.find((row) => row.id === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    const c = plan.identities.find((row) => row.primary_email === 'oid-c@ex.example')
    expect(a?.owner_kind).toBe('none')
    expect(a?.owner_identity_id).toBeNull()
    expect(b?.owner_kind).toBe('sponsor')
    expect(b?.owner_identity_id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(c?.owner_kind).toBe('sponsor')
    expect(c?.owner_identity_id).toBeNull()
    expect(c?.owner_ms_object_id).toBe('internal-oid')
  })

  it('resolves a sponsor to an inventoried internal user and keeps owner_email', () => {
    const pat = CONTOSO_INTERNAL_USERS[0]!
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({
          ms_object_id: 'oid-c',
          display_name: 'C',
          sponsor_ms_object_id: pat.ms_object_id,
          sponsor_email: pat.email,
          sponsor_display_name: pat.display_name,
        }),
      ],
      existing: [],
      internals: [{ ms_object_id: pat.ms_object_id, identity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' }],
      generateId: () => 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    })
    expect(plan.relations).toEqual([
      {
        tenant_id: tenantId,
        from_identity_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        to_identity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        relation_type: 'sponsors',
      },
    ])
    expect(plan.identities[0].owner_identity_id).toBe('dddddddd-dddd-dddd-dddd-dddddddddddd')
    expect(plan.identities[0].owner_email).toBe(pat.email)
    expect(plan.identities[0].identity_class).toBe('external')
  })

  it('falls back to matching the sponsor by email or UPN when the oid is missing from inventory', () => {
    const pat = CONTOSO_INTERNAL_USERS[0]!
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({
          ms_object_id: 'oid-email-only',
          display_name: 'Email Sponsor Guest',
          sponsor_ms_object_id: '99999999-9999-9999-9999-999999999999',
          sponsor_email: pat.email.toUpperCase(),
          sponsor_display_name: pat.display_name,
        }),
      ],
      existing: [],
      internals: [
        {
          ms_object_id: pat.ms_object_id,
          identity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          email: pat.email,
          upn: pat.upn,
        },
      ],
      generateId: () => 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    })
    expect(plan.relations).toEqual([
      {
        tenant_id: tenantId,
        from_identity_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        to_identity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        relation_type: 'sponsors',
      },
    ])
    expect(plan.identities[0].owner_identity_id).toBe('dddddddd-dddd-dddd-dddd-dddddddddddd')
  })

  it('matches a sponsor by UPN when sponsor_ms_object_id is absent', () => {
    const pat = CONTOSO_INTERNAL_USERS[0]!
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({
          ms_object_id: 'oid-upn-only',
          display_name: 'UPN Sponsor Guest',
          sponsor_ms_object_id: null,
          sponsor_email: pat.upn,
        }),
      ],
      existing: [],
      internals: [
        {
          ms_object_id: pat.ms_object_id,
          identity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          email: pat.email,
          upn: pat.upn,
        },
      ],
      generateId: () => 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    })
    expect(plan.relations[0]?.to_identity_id).toBe('dddddddd-dddd-dddd-dddd-dddddddddddd')
  })

  it('skips self even when the guest oid is also in internals', () => {
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({
          ms_object_id: 'oid-self',
          display_name: 'Self',
          sponsor_ms_object_id: 'oid-self',
          sponsor_email: 'self@ex.example',
        }),
      ],
      existing: [],
      internals: [{ ms_object_id: 'oid-self', identity_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' }],
      generateId: () => 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    })
    expect(plan.relations).toEqual([])
    expect(plan.identities[0].owner_identity_id).toBeNull()
    expect(plan.identities[0].owner_email).toBe('self@ex.example')
  })

  it('clears owner_identity_id on rescan when the sponsor is no longer inventoried', () => {
    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({
          ms_object_id: 'oid-b',
          display_name: 'B',
          sponsor_ms_object_id: 'internal-oid',
          sponsor_email: 'pat@contoso.example',
        }),
      ],
      existing: [{ id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', ms_object_id: 'oid-b', identity_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', removed_at: null }],
    })
    expect(plan.relations).toEqual([])
    expect(plan.identities[0].owner_kind).toBe('sponsor')
    expect(plan.identities[0].owner_identity_id).toBeNull()
    expect(plan.identities[0].owner_email).toBe('pat@contoso.example')
  })
})

describe('planInternalInventory', () => {
  it('inventories a Contoso role holder as human_internal and skips guests', () => {
    const adele = CONTOSO_INTERNAL_USERS[1]!
    const plan = planInternalInventory({
      tenantId,
      now,
      incoming: [
        { ...adele, is_role_holder: true },
        {
          ms_object_id: 'guest-oid',
          display_name: 'Guest',
          email: 'g@ex.example',
          upn: 'g@ex.example',
          account_enabled: true,
          user_type: 'Guest',
          is_sponsor: true,
        },
      ],
      existing: [],
      generateId: () => 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    })
    expect(plan.identities).toHaveLength(1)
    expect(plan.identities[0].identity_class).toBe('human_internal')
    expect(plan.accounts[0].account_kind).toBe('user')
    expect(plan.accounts[0].attrs.dedicatedAdmin).toBe(true)
    expect(plan.accounts[0].source_object_id).toBe(adele.ms_object_id)
  })
})

describe('asExternalGuest', () => {
  it('returns the Guest row when identity_id is present', () => {
    const row = { id: 'g1', identity_id: 'g1' } as Guest
    expect(asExternalGuest(row)).toBe(row)
  })

  it('fails closed without identity_id', () => {
    const row = { id: 'g1', identity_id: '' } as Guest
    expect(() => asExternalGuest({ ...row, identity_id: undefined as unknown as string })).toThrow(/missing identity_id/)
  })
})
