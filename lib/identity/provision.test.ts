import { describe, expect, it } from 'vitest'
import { hubRowsFromGuest, hubRowsFromUser, identityStatusFromGuest, isDedicatedAdminAccount, ownerKindFromSponsor } from '@/lib/identity/provision'
import { CONTOSO_INTERNAL_USERS } from '@/lib/demo/internal-users'

const baseGuest = {
  id: '11111111-1111-1111-1111-111111111111',
  tenant_id: '22222222-2222-2222-2222-222222222222',
  ms_object_id: 'entra-oid-1',
  display_name: 'Ada Guest',
  email: 'ada@partner.example',
  upn: 'ada_partner.example#EXT#@contoso.onmicrosoft.com',
  account_enabled: true,
  sponsor_ms_object_id: null as string | null,
  sponsor_display_name: null as string | null,
  sponsor_email: null as string | null,
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  first_seen_at: '2025-01-01T00:00:00.000Z',
  last_seen_at: '2026-01-02T00:00:00.000Z',
}

describe('ownerKindFromSponsor', () => {
  it('is none when sponsor fields are empty (no stub identities)', () => {
    expect(ownerKindFromSponsor(null, null)).toBe('none')
    expect(ownerKindFromSponsor('', '')).toBe('none')
  })

  it('is sponsor when an Entra oid or email is present, without minting an owner identity', () => {
    expect(ownerKindFromSponsor('oid', null)).toBe('sponsor')
    expect(ownerKindFromSponsor(null, 'pat@contoso.com')).toBe('sponsor')
  })
})

describe('identityStatusFromGuest', () => {
  it('maps enabled, disabled, and removed', () => {
    expect(identityStatusFromGuest(true, null)).toBe('active')
    expect(identityStatusFromGuest(false, null)).toBe('disabled')
    expect(identityStatusFromGuest(true, '2026-02-01T00:00:00.000Z')).toBe('removed')
  })
})

describe('hubRowsFromGuest', () => {
  it('uses the guest id for the hub and entra account, and never sets owner_identity_id', () => {
    const { identity, account } = hubRowsFromGuest({
      ...baseGuest,
      sponsor_ms_object_id: 'sponsor-oid',
      sponsor_display_name: 'Pat Sponsor',
      sponsor_email: 'pat@contoso.com',
    })
    expect(identity.id).toBe(baseGuest.id)
    expect(identity.owner_identity_id).toBeNull()
    expect(identity.owner_kind).toBe('sponsor')
    expect(identity.owner_email).toBe('pat@contoso.com')
    expect(account.identity_id).toBe(baseGuest.id)
    expect(account.source).toBe('entra')
    expect(account.source_object_id).toBe('entra-oid-1')
    expect(account.account_kind).toBe('guest')
  })
})

describe('hubRowsFromUser', () => {
  it('builds a human_internal hub and entra user account', () => {
    const pat = CONTOSO_INTERNAL_USERS[0]!
    const { identity, account } = hubRowsFromUser({
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      tenant_id: baseGuest.tenant_id,
      ms_object_id: pat.ms_object_id,
      display_name: pat.display_name,
      email: pat.email,
      upn: pat.upn,
      account_enabled: true,
      last_seen_at: '2026-01-02T00:00:00.000Z',
      dedicated_admin: false,
      inventory_reasons: ['sponsor', 'manager'],
    })
    expect(identity.identity_class).toBe('human_internal')
    expect(identity.owner_identity_id).toBeNull()
    expect(account.account_kind).toBe('user')
    expect(account.source_object_id).toBe(pat.ms_object_id)
    expect(account.attrs.dedicatedAdmin).toBe(false)
  })
})

describe('dedicated admin rule', () => {
  it('flags a cloud-only role holder with an admin name', () => {
    const adele = CONTOSO_INTERNAL_USERS[1]!
    expect(
      isDedicatedAdminAccount({
        holdsDirectoryRole: true,
        onPremisesSyncEnabled: adele.on_premises_sync_enabled,
        displayName: adele.display_name,
        userPrincipalName: adele.upn,
        assignedPlans: adele.assigned_plans,
      }),
    ).toBe(true)
  })

  it('does not flag a synced role holder or a cloud-only user without a role', () => {
    expect(
      isDedicatedAdminAccount({
        holdsDirectoryRole: true,
        onPremisesSyncEnabled: true,
        displayName: 'Adele Admin',
        userPrincipalName: 'adele.admin@contoso.example',
        assignedPlans: [],
      }),
    ).toBe(false)
    expect(
      isDedicatedAdminAccount({
        holdsDirectoryRole: false,
        onPremisesSyncEnabled: false,
        displayName: 'Adele Admin',
        userPrincipalName: 'adele.admin@contoso.example',
        assignedPlans: [],
      }),
    ).toBe(false)
  })

  it('flags a cloud-only role holder with no enabled assigned plans', () => {
    expect(
      isDedicatedAdminAccount({
        holdsDirectoryRole: true,
        onPremisesSyncEnabled: false,
        displayName: 'Megan Bowen',
        userPrincipalName: 'megan.bowen@contoso.example',
        assignedPlans: [],
      }),
    ).toBe(true)
    expect(
      isDedicatedAdminAccount({
        holdsDirectoryRole: true,
        onPremisesSyncEnabled: false,
        displayName: 'Megan Bowen',
        userPrincipalName: 'megan.bowen@contoso.example',
        assignedPlans: [{ capabilityStatus: 'Enabled' }],
      }),
    ).toBe(false)
  })
})
