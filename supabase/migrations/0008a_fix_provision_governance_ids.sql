-- AIGIS 0008a: nest provision_governance_ids table checks
--
-- Owner applies this file to production after 0008. Do not run it from CI or
-- an agent against a remote database. No snapshot: a single BEGIN/COMMIT
-- transaction; any failed gate RAISE EXCEPTION rolls the whole file back.
--
-- Fixes: record "new" has no field "account_id" on risk_scores (and the
-- other seven trigger tables that lack account_id). PL/pgSQL evaluates
-- NEW.account_id even when AND-ed with tg_table_name = 'resource_memberships'.
-- Nested IFs keep the same fill behavior and only touch account_id on
-- resource_memberships. No DML. No Graph writes.
--
-- Companion scripts:
--   supabase/sql/0008a_precheck.sql
--   supabase/sql/0008a_postcheck.sql
--   supabase/sql/0008a_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0008a_precheck.sql
--   2. supabase/migrations/0008a_fix_provision_governance_ids.sql
--   3. supabase/sql/0008a_postcheck.sql
-- Rollback: supabase/sql/0008a_rollback.sql, then the precheck.

BEGIN;

create or replace function provision_governance_ids()
returns trigger
language plpgsql
as $$
begin
  -- guest_id and identity_id exist on all eight trigger tables.
  if new.guest_id is null then
    return new;
  end if;

  if new.identity_id is null then
    select g.identity_id
      into new.identity_id
    from guest_identities g
    where g.id = new.guest_id;
  end if;

  -- account_id exists only on resource_memberships. Nest the table-name
  -- check so NEW.account_id is never referenced on the other seven tables.
  if tg_table_name = 'resource_memberships' then
    if new.account_id is null and new.identity_id is not null then
      select a.id
        into new.account_id
      from identity_accounts a
      where a.identity_id = new.identity_id
        and a.source = 'entra'
      limit 1;
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  src text;
begin
  select p.prosrc into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'provision_governance_ids';
  if src is null then
    raise exception '0008a gate failed: provision_governance_ids missing after replace';
  end if;
  if src not like '%if tg_table_name = ''resource_memberships'' then%' then
    raise exception '0008a gate failed: resource_memberships check is not nested';
  end if;
end $$;

COMMIT;
