-- AIGIS 0004 rollback. Restores the original 0002 identities view and removes
-- the graph tables and guest_identities.identity_id.
--
-- Not part of the supabase migration chain (a numbered migration named
-- 0004_rollback.sql would be applied as a forward migration). Owner-run only.
-- Single transaction: a failure leaves the catalog as it was.
--
-- Idempotent: safe if 0004 was never applied or was already rolled back.
-- After this file: run supabase/sql/0004_precheck.sql to confirm the 0002 view
-- is back, then re-apply 0004_identity_graph.sql if needed.

BEGIN;

drop trigger if exists guest_identities_provision_identity on guest_identities;
drop function if exists provision_identity_for_guest();

alter table if exists guest_identities
  drop constraint if exists guest_identities_identity_id_fkey;
alter table if exists guest_identities
  drop constraint if exists guest_identities_identity_id_key;
drop index if exists guest_identities_identity_id_idx;

alter table if exists guest_identities
  drop column if exists identity_id;

drop table if exists identity_relations;
drop table if exists identity_accounts;

do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'identities'
  ) then
    execute 'drop table public.identities';
  end if;
end $$;

drop view if exists identities_legacy_view;

-- Recreate the original 0002 view (same columns, same guest projection).
create or replace view identities as
select
  g.id,
  g.tenant_id,
  g.identity_class,
  g.external_type as identity_subtype,
  g.ms_object_id,
  g.display_name,
  g.email,
  g.upn,
  g.user_type as entra_user_type,
  g.account_enabled,
  g.external_organization_id,
  g.sponsor_ms_object_id as owner_ms_object_id,
  g.sponsor_display_name as owner_display_name,
  g.last_sign_in_at as last_activity_at,
  g.risk_score,
  g.risk_level,
  g.review_status,
  g.last_reviewed_at,
  g.first_seen_at,
  g.last_seen_at,
  g.removed_at
from guest_identities g;

comment on view identities is 'AIGIS generalized identity view. Phase 1 projects external identities from guest_identities; later phases union privileged, non-human and agent identities.';

COMMIT;
