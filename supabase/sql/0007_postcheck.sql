-- AIGIS 0007 post-check. Run after supabase/migrations/0007_recommendation_explanations.sql
-- commits. Owner-run only.

do $$
declare
  polices bigint;
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'recommendation_explanations'
  ) then
    raise exception '0007 postcheck failed: recommendation_explanations missing (0007 not applied?)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recommendation_explanations' and column_name = 'identity_id'
  ) then
    raise exception '0007 postcheck failed: identity_id column missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recommendation_explanations' and column_name = 'guest_id'
  ) then
    raise exception '0007 postcheck failed: guest_id column missing';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'recommendation_explanations' and c.relrowsecurity
  ) then
    raise exception '0007 postcheck failed: RLS not enabled';
  end if;

  select count(*) into polices
  from pg_policies
  where schemaname = 'public' and tablename = 'recommendation_explanations';
  if polices <> 0 then
    raise exception '0007 postcheck failed: expected deny-all RLS, found % policies', polices;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'recommendation_explanations_identity_idx'
  ) then
    raise exception '0007 postcheck failed: recommendation_explanations_identity_idx missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'recommendation_explanations_guest_idx'
  ) then
    raise exception '0007 postcheck failed: recommendation_explanations_guest_idx missing';
  end if;
end $$;

select
  exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'recommendation_explanations'
  ) as table_exists,
  (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'recommendation_explanations'
  ) as rls_enabled,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'recommendation_explanations') as policy_count;
