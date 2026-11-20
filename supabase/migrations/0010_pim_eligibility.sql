-- AIGIS Phase 2 PR 5: PIM eligibility
--
-- Owner applies this file to production after 0009. Do not run it from CI or
-- an agent against a remote database. No snapshot: a single BEGIN/COMMIT
-- transaction; any failed gate RAISE EXCEPTION rolls the whole file back.
--
-- Adds PIM schedule fields on role_assignments (eligible directory roles)
-- and group_pim_eligibilities (PIM for Groups). RLS on, 0 policies. Does
-- not inventory data, does not touch Graph, and does not change
-- guest_identities.
--
-- Companion scripts:
--   supabase/sql/0010_precheck.sql
--   supabase/sql/0010_postcheck.sql
--   supabase/sql/0010_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0010_precheck.sql
--   2. supabase/migrations/0010_pim_eligibility.sql
--   3. supabase/sql/0010_postcheck.sql
-- Rollback: supabase/sql/0010_rollback.sql, then the precheck.

BEGIN;

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'role_assignments'
  ) then
    raise exception '0010 failed: role_assignments missing (apply 0009 first)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_assignments' and column_name = 'starts_at'
  ) then
    raise exception '0010 failed: role_assignments.starts_at already exists. If 0010 already applied, run 0010_postcheck.sql or 0010_rollback.sql first.';
  end if;

  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0010 failed: group_pim_eligibilities already exists';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Directory PIM fields on role_assignments
-- ---------------------------------------------------------------------------
alter table role_assignments
  add column member_type text not null default 'direct';

alter table role_assignments
  add column pim_status text;

alter table role_assignments
  add column starts_at timestamptz;

alter table role_assignments
  add column ends_at timestamptz;

alter table role_assignments
  add constraint role_assignments_member_type_chk
  check (member_type in ('direct', 'group', 'inherited'));

create index role_assignments_tenant_type_idx
  on role_assignments (tenant_id, assignment_type)
  where removed_at is null;

comment on column role_assignments.assignment_type is
  'active from GET /roleManagement/directory/roleAssignments. eligible from GET /roleManagement/directory/roleEligibilitySchedules.';
comment on column role_assignments.member_type is
  'Graph memberType: direct, group, or inherited.';
comment on column role_assignments.pim_status is
  'Graph eligibility schedule status (for example Provisioned). Null for standing unified assignments.';
comment on column role_assignments.starts_at is
  'PIM schedule start. Null for standing unified assignments and permanent eligibility.';
comment on column role_assignments.ends_at is
  'PIM schedule end. Null when the schedule is permanent.';

-- ---------------------------------------------------------------------------
-- 2. PIM for Groups eligibility
-- ---------------------------------------------------------------------------
create table group_pim_eligibilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ms_schedule_id text not null,
  group_ms_object_id text not null,
  principal_identity_id uuid references identities(id) on delete set null,
  principal_ms_object_id text not null,
  access_id text not null,
  member_type text not null default 'direct',
  pim_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, ms_schedule_id),
  constraint group_pim_eligibilities_access_id_chk
    check (access_id in ('member', 'owner')),
  constraint group_pim_eligibilities_member_type_chk
    check (member_type in ('direct', 'group', 'inherited'))
);

create index group_pim_eligibilities_tenant_principal_idx
  on group_pim_eligibilities (tenant_id, principal_identity_id);
create index group_pim_eligibilities_tenant_group_idx
  on group_pim_eligibilities (tenant_id, group_ms_object_id);

comment on table group_pim_eligibilities is
  'Inventoried PIM for Groups eligibility schedules. GET /identityGovernance/privilegedAccess/group/eligibilitySchedules only.';
comment on column group_pim_eligibilities.ms_schedule_id is
  'Graph privilegedAccessGroupEligibilitySchedule.id.';
comment on column group_pim_eligibilities.access_id is
  'Graph accessId: member or owner.';

alter table group_pim_eligibilities enable row level security;

COMMIT;
