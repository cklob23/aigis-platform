-- AIGIS 0009 precheck. Run against the post-0008 / 0008a schema before applying
-- supabase/migrations/0009_privileged_roles.sql.
-- Owner-run only. Does not write.

do $$
declare
  assignment_set bigint;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'role_assignment_id'
  ) then
    raise exception '0009 precheck failed: review_items.role_assignment_id missing (apply 0008 first)';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'identities'
  ) then
    raise exception '0009 precheck failed: identities missing';
  end if;

  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'directory_roles'
  ) then
    raise exception '0009 precheck failed: directory_roles already exists. If 0009 already applied, run 0009_postcheck.sql or 0009_rollback.sql first.';
  end if;

  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'role_assignments'
  ) then
    raise exception '0009 precheck failed: role_assignments already exists';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'is_privileged'
  ) then
    raise exception '0009 precheck failed: identities.is_privileged already exists';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'privilege_tier'
  ) then
    raise exception '0009 precheck failed: identities.privilege_tier already exists';
  end if;

  select count(*) into assignment_set from review_items where role_assignment_id is not null;
  if assignment_set <> 0 then
    raise exception '0009 precheck failed: review_items.role_assignment_id set = % (must be null before the 0009 FK)', assignment_set;
  end if;
end $$;

select
  (select count(*) from identities) as identities,
  (select count(*) from review_items) as review_items,
  (select count(*) from review_items where role_assignment_id is not null) as review_items_with_assignment;
