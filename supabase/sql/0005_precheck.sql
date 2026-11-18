-- AIGIS 0005 precheck. Run against the post-0004 schema before applying
-- supabase/migrations/0005_governance_fks.sql.
--
-- Not part of the supabase migration chain. Owner-run only. Does not write.
-- Aborts if 0004 is missing or 0005 columns already exist. After a successful
-- 0005 apply, run 0005_postcheck.sql instead.

do $$
begin
  if to_regclass('public.guest_identities') is null then
    raise exception '0005 precheck failed: guest_identities is missing';
  end if;
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'identities'
  ) then
    raise exception '0005 precheck failed: identities table missing (apply 0004 first)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_identities'
      and column_name = 'identity_id'
  ) then
    raise exception '0005 precheck failed: guest_identities.identity_id missing (apply 0004 first)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'review_items'
      and column_name = 'identity_id'
  ) then
    raise exception '0005 precheck failed: review_items.identity_id already exists. If 0005 already applied, run 0005_postcheck.sql or 0005_rollback.sql first.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'resource_memberships'
      and column_name = 'account_id'
  ) then
    raise exception '0005 precheck failed: resource_memberships.account_id already exists';
  end if;
end $$;

select
  (select count(*) from guest_identities) as guest_count,
  (select count(*) from identities) as identity_count,
  (select count(*) from identity_accounts) as account_count,
  (select count(*) from guest_identities where identity_id is null) as identity_id_nulls,
  (select count(*) from resource_memberships) as membership_count,
  (select count(*) from review_items) as review_item_count,
  (select count(*) from alerts) as alert_count,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'guest_id'
  ) as review_items_has_guest_id;
