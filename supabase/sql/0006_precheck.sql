-- AIGIS 0006 precheck. Run against the post-0005 schema before applying
-- supabase/migrations/0006_owner_identity.sql.
-- Owner-run only. Does not write.

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'identities'
  ) then
    raise exception '0006 precheck failed: identities table missing (apply 0004 first)';
  end if;
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'identity_relations'
  ) then
    raise exception '0006 precheck failed: identity_relations missing (apply 0004 first)';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'identity_id'
  ) then
    raise exception '0006 precheck failed: review_items.identity_id missing (apply 0005 first)';
  end if;
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'identities_owner_identity_idx'
  ) then
    raise exception '0006 precheck failed: identities_owner_identity_idx already exists. If 0006 already applied, run 0006_postcheck.sql or 0006_rollback.sql first.';
  end if;
end $$;

select
  (select count(*) from identities) as identity_count,
  (select count(*) from identity_relations where relation_type = 'sponsors') as sponsor_relation_count,
  (select count(*) from identities where owner_identity_id is not null) as owner_identity_set,
  (select count(*) from identities where identity_class = 'human_internal') as human_internal_count;
