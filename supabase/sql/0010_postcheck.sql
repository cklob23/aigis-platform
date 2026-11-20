-- AIGIS 0010 post-check. Run after supabase/migrations/0010_pim_eligibility.sql
-- commits. Owner-run only.
--
-- Gates:
--   role_assignments PIM columns exist
--   group_pim_eligibilities exists
--   RLS on, 0 policies
--   FKs, uniques, indexes, checks present

do $$
declare
  rls boolean;
  pol bigint;
  idx text;
  idx_valid boolean;
  col text;
begin
  foreach col in array array['member_type', 'pim_status', 'starts_at', 'ends_at']
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'role_assignments' and column_name = col
    ) then
      raise exception '0010 postcheck failed: role_assignments.% missing', col;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint where conname = 'role_assignments_member_type_chk'
  ) then
    raise exception '0010 postcheck failed: role_assignments_member_type_chk missing';
  end if;

  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0010 postcheck failed: group_pim_eligibilities missing';
  end if;

  select c.relrowsecurity into rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'group_pim_eligibilities';
  if rls is not true then
    raise exception '0010 postcheck failed: group_pim_eligibilities RLS is off';
  end if;

  select count(*) into pol from pg_policies where schemaname = 'public' and tablename = 'group_pim_eligibilities';
  if pol <> 0 then
    raise exception '0010 postcheck failed: group_pim_eligibilities policies = % (expected 0)', pol;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'group_pim_eligibilities_tenant_id_ms_schedule_id_key'
  ) then
    raise exception '0010 postcheck failed: group_pim_eligibilities unique (tenant_id, ms_schedule_id) missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'group_pim_eligibilities_principal_identity_id_fkey' and contype = 'f'
  ) then
    raise exception '0010 postcheck failed: group_pim_eligibilities.principal_identity_id FK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'group_pim_eligibilities_tenant_id_fkey' and contype = 'f'
  ) then
    raise exception '0010 postcheck failed: group_pim_eligibilities.tenant_id FK missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'group_pim_eligibilities_access_id_chk'
  ) then
    raise exception '0010 postcheck failed: group_pim_eligibilities_access_id_chk missing';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'group_pim_eligibilities_member_type_chk'
  ) then
    raise exception '0010 postcheck failed: group_pim_eligibilities_member_type_chk missing';
  end if;

  foreach idx in array array[
    'role_assignments_tenant_type_idx',
    'group_pim_eligibilities_tenant_principal_idx',
    'group_pim_eligibilities_tenant_group_idx'
  ]
  loop
    select i.indisvalid into idx_valid
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = idx;
    if idx_valid is not true then
      raise exception '0010 postcheck failed: index % missing or not valid', idx;
    end if;
  end loop;
end $$;

select
  (select count(*) from role_assignments where assignment_type = 'eligible') as eligible_assignments,
  (select count(*) from group_pim_eligibilities) as group_pim_eligibilities,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'group_pim_eligibilities') as rls_policies;
