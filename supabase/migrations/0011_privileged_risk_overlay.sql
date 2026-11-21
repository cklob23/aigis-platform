-- AIGIS Phase 2 PR 6: privileged risk overlay
--
-- Owner applies this file to production after 0010. Do not run it from CI or
-- an agent against a remote database. No snapshot: a single BEGIN/COMMIT
-- transaction; any failed gate RAISE EXCEPTION rolls the whole file back.
--
-- Adds identities.risk_factors so the flag-gated privilege overlay can
-- denormalize score factors onto the hub (guests already store factors on
-- guest_identities). Does not inventory data, does not touch Graph, and
-- does not change guest_identities.
--
-- Companion scripts:
--   supabase/sql/0011_precheck.sql
--   supabase/sql/0011_postcheck.sql
--   supabase/sql/0011_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0011_precheck.sql
--   2. supabase/migrations/0011_privileged_risk_overlay.sql
--   3. supabase/sql/0011_postcheck.sql
-- Rollback: supabase/sql/0011_rollback.sql, then the precheck.

BEGIN;

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0011 failed: group_pim_eligibilities missing (apply 0010 first)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'risk_factors'
  ) then
    raise exception '0011 failed: identities.risk_factors already exists. If 0011 already applied, run 0011_postcheck.sql or 0011_rollback.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Hub factor list (mirrors guest_identities.risk_factors)
-- ---------------------------------------------------------------------------
alter table identities
  add column risk_factors jsonb not null default '[]'::jsonb;

comment on column identities.risk_factors is
  'Denormalized score factors from the latest rescore. Guests mirror guest_identities.risk_factors. Privileged overlay writes human_internal factors when the module flag is on. AI does not write this column.';

COMMIT;
