-- AIGIS Phase 1.5 PR7: recommendation_explanations
--
-- Owner applies this file to production after 0006 (or after 0005 if 0006
-- was skipped). Do not run it from CI or an agent against a remote database.
-- No snapshot: a single BEGIN/COMMIT transaction; any failed gate
-- RAISE EXCEPTION rolls the whole file back.
--
-- Additive table for on-demand AI explanations. Dual-write identity_id and
-- guest_id. Deny-all RLS. No Graph writes, no autonomous access changes.
--
-- Idempotent: IF NOT EXISTS.
--
-- Companion scripts:
--   supabase/sql/0007_precheck.sql
--   supabase/sql/0007_postcheck.sql
--   supabase/sql/0007_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0007_precheck.sql
--   2. supabase/migrations/0007_recommendation_explanations.sql
--   3. supabase/sql/0007_postcheck.sql
-- Rollback: supabase/sql/0007_rollback.sql, then the precheck.

BEGIN;

create table if not exists recommendation_explanations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  identity_id uuid not null references identities(id) on delete cascade,
  guest_id uuid references guest_identities(id) on delete set null,
  recommended_action text not null,
  explanation text not null,
  citations jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_explanations_identity_idx
  on recommendation_explanations (tenant_id, identity_id, created_at desc);

create index if not exists recommendation_explanations_guest_idx
  on recommendation_explanations (tenant_id, guest_id, created_at desc);

comment on table recommendation_explanations is
  'On-demand recommend/explain output. Flag default off. Humans still approve any access change. guest_id is dual-write through Phase 1.5.';

alter table recommendation_explanations enable row level security;

do $$
declare
  polices bigint;
  missing_identity boolean;
  missing_guest boolean;
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'recommendation_explanations'
  ) then
    raise exception '0007 gate failed: recommendation_explanations missing';
  end if;

  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recommendation_explanations' and column_name = 'identity_id'
  ) into missing_identity;
  if missing_identity then
    raise exception '0007 gate failed: identity_id column missing';
  end if;

  select not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recommendation_explanations' and column_name = 'guest_id'
  ) into missing_guest;
  if missing_guest then
    raise exception '0007 gate failed: guest_id column missing';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'recommendation_explanations' and c.relrowsecurity
  ) then
    raise exception '0007 gate failed: RLS not enabled on recommendation_explanations';
  end if;

  select count(*) into polices
  from pg_policies
  where schemaname = 'public' and tablename = 'recommendation_explanations';
  if polices <> 0 then
    raise exception '0007 gate failed: expected deny-all RLS, found % policies', polices;
  end if;
end $$;

COMMIT;
