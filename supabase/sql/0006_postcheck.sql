-- AIGIS 0006 post-check. Run after supabase/migrations/0006_owner_identity.sql
-- commits. Owner-run only.

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
    raise exception '0006 postcheck failed: identities_owner_identity_idx missing (0006 not applied?)';
  end if;

  select count(*) into missing_fk
  from identities i
  left join identities o on o.id = i.owner_identity_id
  where i.owner_identity_id is not null and o.id is null;
  if missing_fk <> 0 then
    raise exception '0006 postcheck failed: owner_identity_id not in identities = %', missing_fk;
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
    raise exception '0006 postcheck failed: owner_identity_id without sponsors relation = %', dangling;
  end if;

  select count(*) into stub_humans
  from identities i
  where i.identity_class = 'human_internal'
    and not exists (
      select 1
      from identity_accounts a
      where a.identity_id = i.id
        and a.source = 'entra'
        and a.account_kind = 'user'
    );
  if stub_humans <> 0 then
    raise exception '0006 postcheck failed: human_internal stub identities = %', stub_humans;
  end if;
end $$;

select
  (select count(*) from identities) as identity_count,
  (select count(*) from identity_relations where relation_type = 'sponsors') as sponsor_relation_count,
  (select count(*) from identities where owner_identity_id is not null) as owner_identity_set,
  (select count(*) from identities where identity_class = 'human_internal') as human_internal_count,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'identities_owner_identity_idx'
  ) as owner_identity_index;
