-- AIGIS 0008 post-check. Run after supabase/migrations/0008_identity_first_governance.sql
-- commits. Owner-run only.
--
-- Gates:
--   guest_id is nullable on the four tables
--   four subject_present checks exist and are validated
--   all review_items have subject_kind identity and role_assignment_id null
--   both partial unique indexes are valid
--   the eight provision_governance_ids triggers still exist
--   identities_legacy_view count = guest_identities count

do $$
declare
  t text;
  nullable text;
  chk text;
  validated boolean;
  bad_kind bigint;
  assignment_set bigint;
  idx text;
  idx_valid boolean;
  trigger_count bigint;
  legacy_count bigint;
  guest_count bigint;
begin
  foreach t in array array['resource_memberships', 'guest_activity', 'risk_scores', 'review_items']
  loop
    select c.is_nullable into nullable
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.column_name = 'guest_id';
    if nullable is distinct from 'YES' then
      raise exception '0008 postcheck failed: %.guest_id is_nullable = % (expected YES)', t, nullable;
    end if;

    chk := t || '_subject_present_chk';
    select convalidated into validated
    from pg_constraint
    where conname = chk
      and conrelid = ('public.' || t)::regclass;
    if validated is not true then
      raise exception '0008 postcheck failed: % missing or not validated', chk;
    end if;
  end loop;

  select count(*) into bad_kind from review_items where subject_kind is distinct from 'identity';
  if bad_kind <> 0 then
    raise exception '0008 postcheck failed: review_items.subject_kind not identity = %', bad_kind;
  end if;

  select count(*) into assignment_set from review_items where role_assignment_id is not null;
  if assignment_set <> 0 then
    raise exception '0008 postcheck failed: review_items.role_assignment_id set = %', assignment_set;
  end if;

  foreach idx in array array['review_items_review_identity_uidx', 'review_items_review_assignment_uidx']
  loop
    select i.indisvalid into idx_valid
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = idx;
    if idx_valid is not true then
      raise exception '0008 postcheck failed: index % missing or not valid', idx;
    end if;
  end loop;

  select count(*) into trigger_count
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'resource_memberships_provision_governance_ids',
      'guest_activity_provision_governance_ids',
      'risk_scores_provision_governance_ids',
      'risk_findings_provision_governance_ids',
      'review_items_provision_governance_ids',
      'remediation_actions_provision_governance_ids',
      'alerts_provision_governance_ids',
      'scan_changes_provision_governance_ids'
    );
  if trigger_count <> 8 then
    raise exception '0008 postcheck failed: provision_governance_ids triggers = % (expected 8)', trigger_count;
  end if;

  select count(*) into legacy_count from identities_legacy_view;
  select count(*) into guest_count from guest_identities;
  if legacy_count is distinct from guest_count then
    raise exception '0008 postcheck failed: identities_legacy_view count (%) != guest_identities (%)', legacy_count, guest_count;
  end if;
end $$;

select
  (select count(*) from resource_memberships) as resource_memberships,
  (select count(*) from guest_activity) as guest_activity,
  (select count(*) from risk_scores) as risk_scores,
  (select count(*) from review_items) as review_items,
  (select count(*) from identities_legacy_view) as identities_legacy_view,
  (select count(*) from guest_identities) as guest_identities;
