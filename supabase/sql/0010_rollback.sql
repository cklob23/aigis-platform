-- AIGIS 0010 rollback. Drops group_pim_eligibilities and the PIM columns on
-- role_assignments. Does not drop role_assignments (0009 owns that table).
--
-- Not part of the supabase migration chain. Owner-run only. Single
-- transaction: a failure leaves the catalog as it was.
-- After this file: run supabase/sql/0010_precheck.sql to confirm the
-- post-0009 shape is back.

BEGIN;

drop table if exists group_pim_eligibilities;

drop index if exists role_assignments_tenant_type_idx;

alter table if exists role_assignments drop constraint if exists role_assignments_member_type_chk;
alter table if exists role_assignments drop column if exists ends_at;
alter table if exists role_assignments drop column if exists starts_at;
alter table if exists role_assignments drop column if exists pim_status;
alter table if exists role_assignments drop column if exists member_type;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_assignments' and column_name = 'assignment_type'
  ) then
    execute $c$comment on column role_assignments.assignment_type is 'active for unified roleAssignments. eligible is reserved.'$c$;
  end if;
end $$;

COMMIT;
