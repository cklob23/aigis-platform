-- AIGIS 0005 post-check. Run after supabase/migrations/0005_governance_fks.sql
-- commits. Not part of the supabase migration chain. Owner-run only.
--
-- Gates (RAISE EXCEPTION on failure):
--   rows with guest_id have identity_id
--   identity_id matches guest_identities.identity_id
--   memberships with guest_id have an entra account_id
--   guest_id columns still exist

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'identity_id'
  ) then
    raise exception '0005 postcheck failed: review_items.identity_id missing (0005 not applied?)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'resource_memberships' and column_name = 'account_id'
  ) then
    raise exception '0005 postcheck failed: resource_memberships.account_id missing';
  end if;
end $$;

do $$
declare
  t text;
  guest_nulls bigint;
  mismatched bigint;
  missing_fk bigint;
  account_nulls bigint;
  account_mismatch bigint;
  guest_col_missing boolean;
begin
  foreach t in array array[
    'resource_memberships',
    'guest_activity',
    'risk_scores',
    'risk_findings',
    'review_items',
    'remediation_actions',
    'alerts',
    'scan_changes'
  ]
  loop
    execute format(
      'select count(*) from public.%I where guest_id is not null and identity_id is null',
      t
    ) into guest_nulls;
    if guest_nulls <> 0 then
      raise exception '0005 postcheck failed: %.identity_id nulls where guest_id is set = %', t, guest_nulls;
    end if;

    execute format(
      'select count(*)
       from public.%I r
       join guest_identities g on g.id = r.guest_id
       where r.guest_id is not null
         and r.identity_id is distinct from g.identity_id',
      t
    ) into mismatched;
    if mismatched <> 0 then
      raise exception '0005 postcheck failed: %.identity_id mismatches guest_identities.identity_id = %', t, mismatched;
    end if;

    execute format(
      'select count(*)
       from public.%I r
       left join identities i on i.id = r.identity_id
       where r.identity_id is not null and i.id is null',
      t
    ) into missing_fk;
    if missing_fk <> 0 then
      raise exception '0005 postcheck failed: %.identity_id not in identities = %', t, missing_fk;
    end if;

    select not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'guest_id'
    ) into guest_col_missing;
    if guest_col_missing then
      raise exception '0005 postcheck failed: %.guest_id is missing', t;
    end if;
  end loop;

  select count(*) into account_nulls
  from resource_memberships
  where guest_id is not null and account_id is null;
  if account_nulls <> 0 then
    raise exception '0005 postcheck failed: resource_memberships.account_id nulls = %', account_nulls;
  end if;

  select count(*) into account_mismatch
  from resource_memberships m
  left join identity_accounts a on a.id = m.account_id
  where m.account_id is not null
    and (
      a.id is null
      or a.identity_id is distinct from m.identity_id
      or a.source is distinct from 'entra'
    );
  if account_mismatch <> 0 then
    raise exception '0005 postcheck failed: resource_memberships.account_id mismatches entra account = %', account_mismatch;
  end if;
end $$;

select
  (select count(*) from resource_memberships) as membership_count,
  (select count(*) from resource_memberships where guest_id is not null and identity_id is null) as membership_identity_nulls,
  (select count(*) from resource_memberships where guest_id is not null and account_id is null) as membership_account_nulls,
  (select count(*) from guest_activity where guest_id is not null and identity_id is null) as activity_identity_nulls,
  (select count(*) from risk_scores where guest_id is not null and identity_id is null) as risk_score_identity_nulls,
  (select count(*) from risk_findings where guest_id is not null and identity_id is null) as finding_identity_nulls,
  (select count(*) from review_items where guest_id is not null and identity_id is null) as review_item_identity_nulls,
  (select count(*) from remediation_actions where guest_id is not null and identity_id is null) as remediation_identity_nulls,
  (select count(*) from alerts where guest_id is not null and identity_id is null) as alert_identity_nulls,
  (select count(*) from scan_changes where guest_id is not null and identity_id is null) as scan_change_identity_nulls,
  (select count(*) from alerts where guest_id is null) as alerts_without_guest,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'guest_id'
  ) as review_items_has_guest_id;
