-- AIGIS Phase 2 PR 4: Entra directory roles and tiers
--
-- Owner applies this file to production after 0008 / 0008a. Do not run it
-- from CI or an agent against a remote database. No snapshot: a single
-- BEGIN/COMMIT transaction; any failed gate RAISE EXCEPTION rolls the whole
-- file back.
--
-- Adds directory_roles and role_assignments, FKs (including
-- review_items.role_assignment_id), uniques, indexes, deny-all RLS with 0
-- policies, and identities.is_privileged / privilege_tier. Does not inventory
-- data, does not touch Graph, and does not change guest_identities.
--
-- Companion scripts:
--   supabase/sql/0009_precheck.sql
--   supabase/sql/0009_postcheck.sql
--   supabase/sql/0009_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0009_precheck.sql
--   2. supabase/migrations/0009_privileged_roles.sql
--   3. supabase/sql/0009_postcheck.sql
-- Rollback: supabase/sql/0009_rollback.sql, then the precheck.

BEGIN;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'review_items' and column_name = 'role_assignment_id'
  ) then
    raise exception '0009 failed: review_items.role_assignment_id missing (apply 0008 first)';
  end if;

  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'directory_roles'
  ) then
    raise exception '0009 failed: directory_roles already exists. If 0009 already applied, run 0009_postcheck.sql or 0009_rollback.sql first.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'is_privileged'
  ) then
    raise exception '0009 failed: identities.is_privileged already exists';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Identity privilege flags. ms Graph isPrivileged never writes these.
-- ---------------------------------------------------------------------------
alter table identities
  add column is_privileged boolean not null default false;

alter table identities
  add column privilege_tier smallint;

alter table identities
  add constraint identities_privilege_flags_chk
  check (
    (is_privileged = false and privilege_tier is null)
    or (is_privileged = true and privilege_tier is not null and privilege_tier in (0, 1, 2))
  );

create index identities_tenant_privileged_idx
  on identities (tenant_id)
  where is_privileged = true;

comment on column identities.is_privileged is
  'True when the identity currently holds at least one inventoried privileged directory role. Excluded roles (Directory Readers, Guest Inviter) do not set this.';
comment on column identities.privilege_tier is
  'Highest (lowest number) privileged role tier held: 0, 1, or 2. Null when is_privileged is false.';

-- ---------------------------------------------------------------------------
-- 2. Directory role definitions (Entra unified RBAC)
-- ---------------------------------------------------------------------------
create table directory_roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ms_role_id text not null,
  template_id text,
  display_name text not null,
  description text,
  is_built_in boolean not null default true,
  ms_is_privileged boolean not null default false,
  is_privileged boolean not null default false,
  privilege_tier smallint,
  tier_rule text not null,
  tier_map_version text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, ms_role_id),
  constraint directory_roles_tier_rule_chk
    check (tier_rule in ('t0_fixed', 't2_reader', 'default_t1', 'custom_default', 'excluded')),
  constraint directory_roles_privilege_flags_chk
    check (
      (tier_rule = 'excluded' and is_privileged = false and privilege_tier is null)
      or (tier_rule <> 'excluded' and is_privileged = true and privilege_tier is not null and privilege_tier in (0, 1, 2))
    )
);

create index directory_roles_tenant_tier_idx
  on directory_roles (tenant_id, privilege_tier);
create index directory_roles_tenant_privileged_idx
  on directory_roles (tenant_id)
  where is_privileged = true and removed_at is null;

comment on table directory_roles is
  'Inventoried Entra directory role definitions. privilege_tier comes from the AIGIS tier map (template ID), not from Graph isPrivileged.';
comment on column directory_roles.ms_role_id is
  'Graph unifiedRoleDefinition.id.';
comment on column directory_roles.template_id is
  'Graph unifiedRoleDefinition.templateId. Built-in roles use the Microsoft template ID; custom roles typically equal ms_role_id.';
comment on column directory_roles.ms_is_privileged is
  'Graph isPrivileged, stored as information only. Never used to set privilege_tier.';
comment on column directory_roles.tier_rule is
  'How the tier was chosen: t0_fixed, t2_reader, default_t1, custom_default, or excluded.';

alter table directory_roles enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Role assignments (active unified RBAC assignments)
-- ---------------------------------------------------------------------------
create table role_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ms_assignment_id text not null,
  directory_role_id uuid not null references directory_roles(id) on delete cascade,
  principal_identity_id uuid references identities(id) on delete set null,
  principal_ms_object_id text not null,
  directory_scope_id text not null default '/',
  assignment_type text not null default 'active',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, ms_assignment_id),
  constraint role_assignments_type_chk
    check (assignment_type in ('active', 'eligible'))
);

create index role_assignments_tenant_principal_idx
  on role_assignments (tenant_id, principal_identity_id);
create index role_assignments_tenant_role_idx
  on role_assignments (tenant_id, directory_role_id);
create index role_assignments_tenant_principal_ms_idx
  on role_assignments (tenant_id, principal_ms_object_id);

comment on table role_assignments is
  'Inventoried Entra directory role assignments. GET /roleManagement/directory/roleAssignments only.';
comment on column role_assignments.ms_assignment_id is
  'Graph unifiedRoleAssignment.id.';
comment on column role_assignments.principal_identity_id is
  'Hub identity when the principal is an inventoried user. Null when the principal is not in inventory (group, SP, or unknown).';
comment on column role_assignments.assignment_type is
  'active for unified roleAssignments. eligible is reserved.';

alter table role_assignments enable row level security;

-- ---------------------------------------------------------------------------
-- 4. review_items.role_assignment_id FK (column added in 0008)
-- ---------------------------------------------------------------------------
alter table review_items
  add constraint review_items_role_assignment_id_fkey
  foreign key (role_assignment_id) references role_assignments(id) on delete set null;

COMMIT;
