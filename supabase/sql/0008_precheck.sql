-- AIGIS 0008 precheck. Run against the post-0007 schema before applying
-- supabase/migrations/0008_identity_first_governance.sql.
-- Owner-run only. Does not write.
--
-- Last prod capture (print only, do not hard-fail on these numbers):
--   resource_memberships 2609
--   guest_activity 346
--   risk_scores 8645
--   review_items 549

do $$
declare
  t text;
  nullable text;
  guest_nulls bigint;
  dupes bigint;
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'recommendation_explanations'
  ) then
    raise exception '0008 precheck failed: recommendation_explanations missing (apply 0007 first)';
  end if;

  if not exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'identities_legacy_view'
  ) then
    raise exception '0008 precheck failed: identities_legacy_view missing';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'subject_kind'
  ) then
    raise exception '0008 precheck failed: review_items.subject_kind already exists. If 0008 already applied, run 0008_postcheck.sql or 0008_rollback.sql first.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'role_assignment_id'
  ) then
    raise exception '0008 precheck failed: review_items.role_assignment_id already exists';
  end if;

  foreach t in array array['resource_memberships', 'guest_activity', 'risk_scores', 'review_items']
  loop
    select c.is_nullable into nullable
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t and c.column_name = 'guest_id';
    if nullable is null then
      raise exception '0008 precheck failed: %.guest_id missing', t;
    end if;
    if nullable is distinct from 'NO' then
      raise exception '0008 precheck failed: %.guest_id is nullable (expected NOT NULL before 0008)', t;
    end if;

    execute format(
      'select count(*) from public.%I where guest_id is not null and identity_id is null',
      t
    ) into guest_nulls;
    if guest_nulls <> 0 then
      raise exception '0008 precheck failed: %.identity_id nulls where guest_id is set = %', t, guest_nulls;
    end if;
  end loop;

  select count(*) into dupes
  from (
    select review_id, identity_id
    from review_items
    where identity_id is not null
    group by review_id, identity_id
    having count(*) > 1
  ) d;
  if dupes <> 0 then
    raise exception '0008 precheck failed: (review_id, identity_id) is not unique among existing review_items (% duplicate groups)', dupes;
  end if;
end $$;

select
  (select count(*) from resource_memberships) as resource_memberships,
  (select count(*) from guest_activity) as guest_activity,
  (select count(*) from risk_scores) as risk_scores,
  (select count(*) from review_items) as review_items,
  (select count(*) from identities_legacy_view) as identities_legacy_view,
  (select count(*) from guest_identities) as guest_identities;
