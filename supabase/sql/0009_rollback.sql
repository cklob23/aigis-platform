-- AIGIS 0009 rollback. Drops directory_roles, role_assignments, the
-- review_items.role_assignment_id FK, and identities privilege columns.
-- Does not drop review_items.role_assignment_id (0008 owns that column).
--
-- Not part of the supabase migration chain. Owner-run only. Single
-- transaction: a failure leaves the catalog as it was.
--
-- If review_items still reference role_assignments, this file raises and
-- does not alter the catalog. Null those FKs first.
-- If 0010 objects exist, roll back 0010 first.
-- After this file: run supabase/sql/0009_precheck.sql to confirm the
-- post-0008 shape is back.

BEGIN;

do $$
declare
  assignment_set bigint;
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0009 rollback failed: roll back 0010 first (group_pim_eligibilities exists)';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_assignments' and column_name = 'starts_at'
  ) then
    raise exception '0009 rollback failed: roll back 0010 first (role_assignments.starts_at exists)';
  end if;
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'role_assignments'
  ) then
    select count(*) into assignment_set from review_items where role_assignment_id is not null;
    if assignment_set <> 0 then
      raise exception '0009 rollback failed: review_items.role_assignment_id set = %. Null those FKs first.', assignment_set;
    end if;
  end if;
end $$;

alter table if exists review_items drop constraint if exists review_items_role_assignment_id_fkey;

drop table if exists role_assignments;
drop table if exists directory_roles;

alter table if exists identities drop constraint if exists identities_privilege_flags_chk;
drop index if exists identities_tenant_privileged_idx;
alter table if exists identities drop column if exists privilege_tier;
alter table if exists identities drop column if exists is_privileged;

COMMIT;
