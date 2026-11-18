-- AIGIS 0007 precheck. Run against the post-0005 (or post-0006) schema
-- before applying supabase/migrations/0007_recommendation_explanations.sql.
-- Owner-run only. Does not write.

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'identities'
  ) then
    raise exception '0007 precheck failed: identities table missing (apply 0004 first)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'identity_id'
  ) then
    raise exception '0007 precheck failed: review_items.identity_id missing (apply 0005 first)';
  end if;
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'recommendation_explanations'
  ) then
    raise exception '0007 precheck failed: recommendation_explanations already exists. If 0007 already applied, run 0007_postcheck.sql or 0007_rollback.sql first.';
  end if;
end $$;

select
  (select count(*) from identities) as identity_count,
  (select count(*) from guest_identities) as guest_count;
