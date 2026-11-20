-- AIGIS 0010 precheck. Run against the post-0009 schema before applying
-- supabase/migrations/0010_pim_eligibility.sql.
-- Owner-run only. Does not write.

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'directory_roles'
  ) then
    raise exception '0010 precheck failed: directory_roles missing (apply 0009 first)';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'role_assignments'
  ) then
    raise exception '0010 precheck failed: role_assignments missing (apply 0009 first)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_assignments' and column_name = 'starts_at'
  ) then
    raise exception '0010 precheck failed: role_assignments.starts_at already exists. If 0010 already applied, run 0010_postcheck.sql or 0010_rollback.sql first.';
  end if;

  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0010 precheck failed: group_pim_eligibilities already exists';
  end if;
end $$;

select
  (select count(*) from directory_roles) as directory_roles,
  (select count(*) from role_assignments) as role_assignments,
  (select count(*) from role_assignments where assignment_type = 'eligible') as eligible_assignments;
