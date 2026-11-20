-- AIGIS 0009 post-check. Run after supabase/migrations/0009_privileged_roles.sql
-- commits. Owner-run only.
--
-- Gates:
--   directory_roles and role_assignments exist
--   RLS on, 0 policies
--   FKs, uniques, indexes, checks present
--   identities.is_privileged / privilege_tier present
--   review_items.role_assignment_id FK exists

do $$
declare
  rls_roles boolean;
  rls_assign boolean;
  pol_roles bigint;
  pol_assign bigint;
  fk_review text;
  fk_role text;
  fk_principal text;
  idx_valid boolean;
  idx text;
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'directory_roles'
  ) then
    raise exception '0009 postcheck failed: directory_roles missing';
  end if;
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'role_assignments'
  ) then
    raise exception '0009 postcheck failed: role_assignments missing';
  end if;

  select c.relrowsecurity into rls_roles
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'directory_roles';
  select c.relrowsecurity into rls_assign
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'role_assignments';
  if rls_roles is not true then
    raise exception '0009 postcheck failed: directory_roles RLS is off';
  end if;
  if rls_assign is not true then
    raise exception '0009 postcheck failed: role_assignments RLS is off';
  end if;

  select count(*) into pol_roles from pg_policies where schemaname = 'public' and tablename = 'directory_roles';
  select count(*) into pol_assign from pg_policies where schemaname = 'public' and tablename = 'role_assignments';
  if pol_roles <> 0 then
    raise exception '0009 postcheck failed: directory_roles policies = % (expected 0)', pol_roles;
  end if;
  if pol_assign <> 0 then
    raise exception '0009 postcheck failed: role_assignments policies = % (expected 0)', pol_assign;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'is_privileged'
  ) then
    raise exception '0009 postcheck failed: identities.is_privileged missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'privilege_tier'
  ) then
    raise exception '0009 postcheck failed: identities.privilege_tier missing';
  end if;

  select conname into fk_review
  from pg_constraint
  where conname = 'review_items_role_assignment_id_fkey'
    and contype = 'f';
  if fk_review is null then
    raise exception '0009 postcheck failed: review_items.role_assignment_id FK missing';
  end if;

  select conname into fk_role
  from pg_constraint
  where conname = 'role_assignments_directory_role_id_fkey'
    and contype = 'f';
  if fk_role is null then
    raise exception '0009 postcheck failed: role_assignments.directory_role_id FK missing';
  end if;

  select conname into fk_principal
  from pg_constraint
  where conname = 'role_assignments_principal_identity_id_fkey'
    and contype = 'f';
  if fk_principal is null then
    raise exception '0009 postcheck failed: role_assignments.principal_identity_id FK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'directory_roles_tenant_id_ms_role_id_key'
  ) then
    raise exception '0009 postcheck failed: directory_roles unique (tenant_id, ms_role_id) missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'role_assignments_tenant_id_ms_assignment_id_key'
  ) then
    raise exception '0009 postcheck failed: role_assignments unique (tenant_id, ms_assignment_id) missing';
  end if;

  foreach idx in array array[
    'directory_roles_tenant_tier_idx',
    'directory_roles_tenant_privileged_idx',
    'role_assignments_tenant_principal_idx',
    'role_assignments_tenant_role_idx',
    'role_assignments_tenant_principal_ms_idx',
    'identities_tenant_privileged_idx'
  ]
  loop
    select i.indisvalid into idx_valid
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = idx;
    if idx_valid is not true then
      raise exception '0009 postcheck failed: index % missing or not valid', idx;
    end if;
  end loop;
end $$;

select
  (select count(*) from directory_roles) as directory_roles,
  (select count(*) from role_assignments) as role_assignments,
  (select count(*) from identities where is_privileged) as privileged_identities,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('directory_roles', 'role_assignments')) as rls_policies;
