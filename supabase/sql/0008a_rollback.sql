-- AIGIS 0008a rollback. Restores the 0005 provision_governance_ids() body
-- (compound AND on tg_table_name and NEW.account_id). Does not drop
-- triggers, columns, or guest data.
--
-- Not part of the supabase migration chain. Owner-run only. Single
-- transaction: a failure leaves the catalog as it was.
-- After this file: run supabase/sql/0008a_precheck.sql to confirm the
-- post-0008 function body is back.

BEGIN;

create or replace function provision_governance_ids()
returns trigger
language plpgsql
as $$
begin
  if new.guest_id is null then
    return new;
  end if;

  if new.identity_id is null then
    select g.identity_id
      into new.identity_id
    from guest_identities g
    where g.id = new.guest_id;
  end if;

  if tg_table_name = 'resource_memberships'
     and new.account_id is null
     and new.identity_id is not null then
    select a.id
      into new.account_id
    from identity_accounts a
    where a.identity_id = new.identity_id
      and a.source = 'entra'
    limit 1;
  end if;

  return new;
end;
$$;

COMMIT;
