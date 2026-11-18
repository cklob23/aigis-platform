-- Local/test fixture only. Three external guests, including one with a sponsor
-- and one removed. No human_internal rows. Not for production.

insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Test Org')
on conflict (id) do nothing;

insert into tenants (id, organization_id, ms_tenant_id, display_name, connection_status)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'ms-test-tenant',
  'Test Tenant',
  'connected'
)
on conflict (id) do nothing;

insert into guest_identities (
  id,
  tenant_id,
  ms_object_id,
  display_name,
  email,
  upn,
  user_type,
  account_enabled,
  identity_class,
  sponsor_ms_object_id,
  sponsor_email,
  sponsor_display_name,
  first_seen_at,
  last_seen_at,
  removed_at
)
values
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000010',
    'oid-1',
    'Guest One',
    'one@partner.example',
    'one_partner.example#EXT#@test.onmicrosoft.com',
    'Guest',
    true,
    'external',
    'sponsor-oid',
    'pat@contoso.example',
    'Pat Sponsor',
    now(),
    now(),
    null
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000010',
    'oid-2',
    'Guest Two',
    'two@vendor.example',
    'two_vendor.example#EXT#@test.onmicrosoft.com',
    'Guest',
    false,
    'external',
    null,
    null,
    null,
    now(),
    now(),
    null
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000010',
    'oid-3',
    'Guest Three',
    'three@old.example',
    'three_old.example#EXT#@test.onmicrosoft.com',
    'Guest',
    false,
    'external',
    null,
    null,
    null,
    now(),
    now(),
    now()
  )
on conflict (tenant_id, ms_object_id) do nothing;
