-- AIGIS Phase 1.5 PR4: owner identity index and backfill
--
-- Owner applies this file to production after 0005. Do not run it from CI
-- or an agent against a remote database. No snapshot: a single BEGIN/COMMIT
-- transaction; any failed gate RAISE EXCEPTION rolls the whole file back.
--
-- Additive: index on identities.owner_identity_id, then backfill that column
-- from identity_relations (sponsors) when the other identity is already
-- inventoried. Does not mint human_internal stub identities. guest_id stays.
--
-- Idempotent: IF NOT EXISTS, backfill only nulls.
--
-- Companion scripts:
--   supabase/sql/0006_precheck.sql
--   supabase/sql/0006_postcheck.sql
--   supabase/sql/0006_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0006_precheck.sql
--   2. supabase/migrations/0006_owner_identity.sql
--   3. supabase/sql/0006_postcheck.sql
-- Rollback: supabase/sql/0006_rollback.sql, then the precheck.

BEGIN;

create index if not exists identities_owner_identity_idx
  on identities (tenant_id, owner_identity_id);

comment on index identities_owner_identity_idx is
  'Lookup identities by resolved owner. Unresolved sponsors stay on owner_email / owner_ms_object_id.';

update identities i
set owner_identity_id = r.to_identity_id
from identity_relations r
where r.tenant_id = i.tenant_id
  and r.from_identity_id = i.id
  and r.relation_type = 'sponsors'
  and i.owner_identity_id is null;

do $$
declare
  missing_fk bigint;
  dangling bigint;
  stub_humans bigint;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'identities_owner_identity_idx'
  ) then
    raise exception '0006 gate failed: identities_owner_identity_idx missing';
  end if;

  select count(*) into missing_fk
  from identities i
  left join identities o on o.id = i.owner_identity_id
  where i.owner_identity_id is not null and o.id is null;
  if missing_fk <> 0 then
    raise exception '0006 gate failed: owner_identity_id not in identities = %', missing_fk;
  end if;

  select count(*) into dangling
  from identities i
  where i.owner_identity_id is not null
    and not exists (
      select 1 from identity_relations r
      where r.from_identity_id = i.id
        and r.to_identity_id = i.owner_identity_id
        and r.relation_type = 'sponsors'
    );
  if dangling <> 0 then
    raise exception '0006 gate failed: owner_identity_id without sponsors relation = %', dangling;
  end if;

  select count(*) into stub_humans
  from identities
  where identity_class = 'human_internal';
  if stub_humans <> 0 then
    raise exception '0006 gate failed: unexpected human_internal stub identities = %', stub_humans;
  end if;
end $$;

COMMIT;
