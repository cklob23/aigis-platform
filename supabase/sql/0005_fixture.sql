-- Local/test fixture only. Governance rows with guest_id and no identity_id
-- so 0005 backfill can be asserted. Assumes 0004_fixture.sql + 0004 applied.
-- Not for production.

insert into resources (
  id,
  tenant_id,
  ms_object_id,
  resource_type,
  display_name
)
values (
  '00000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000010',
  'group-oid-1',
  'm365_group',
  'Finance Group'
)
on conflict (tenant_id, ms_object_id, resource_type) do nothing;

insert into resource_memberships (id, tenant_id, guest_id, resource_id, membership_type)
values (
  '00000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000201',
  'member'
)
on conflict (tenant_id, guest_id, resource_id) do nothing;

insert into guest_activity (id, tenant_id, guest_id, activity_type)
values (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000101',
  'scanned'
)
on conflict (id) do nothing;

insert into risk_scores (id, tenant_id, guest_id, score, level)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000101',
  42,
  'high'
)
on conflict (id) do nothing;

insert into risk_findings (id, tenant_id, guest_id, severity, finding_type, title)
values (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000101',
  'high',
  'no_sponsor',
  'Guest One: no sponsor'
)
on conflict (id) do nothing;

insert into access_reviews (id, tenant_id, name, status)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000010',
  'Fixture review',
  'active'
)
on conflict (id) do nothing;

insert into review_items (id, tenant_id, review_id, guest_id, status)
values (
  '00000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000101',
  'pending'
)
on conflict (review_id, guest_id) do nothing;

insert into remediation_actions (id, tenant_id, guest_id, action_type, status, reason)
values (
  '00000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000101',
  'disable_guest',
  'pending',
  'fixture'
)
on conflict (id) do nothing;

insert into alerts (id, tenant_id, alert_type, severity, title, guest_id)
values
  (
    '00000000-0000-0000-0000-000000000a01',
    '00000000-0000-0000-0000-000000000010',
    'risk_level',
    'high',
    'Guest One high risk',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000a02',
    '00000000-0000-0000-0000-000000000010',
    'scan_failed',
    'medium',
    'Scan failed',
    null
  )
on conflict (id) do nothing;

insert into scan_changes (id, tenant_id, change_type, guest_id)
values
  (
    '00000000-0000-0000-0000-000000000b01',
    '00000000-0000-0000-0000-000000000010',
    'new_guest',
    '00000000-0000-0000-0000-000000000101'
  ),
  (
    '00000000-0000-0000-0000-000000000b02',
    '00000000-0000-0000-0000-000000000010',
    'new_domain',
    null
  )
on conflict (id) do nothing;
