-- AIGIS 0004 post-check. Run after supabase/migrations/0004_identity_graph.sql
-- commits. Not part of the supabase migration chain. Owner-run only.
--
-- Gates (RAISE EXCEPTION on failure):
--   external identities = guests
--   guest accounts = guests
--   identities = guests + inventoried human_internal
--   accounts = identities
--   identities_legacy_view = guests (unchanged by internals)
--   no null identity_id
--   no human_internal stubs (internals without an entra user account)
--   unique keys hold

do $$
begin
  if to_regclass('public.identities') is null
     or not exists (
       select 1 from pg_tables
       where schemaname = 'public' and tablename = 'identities'
     ) then
    raise exception '0004 postcheck failed: identities table missing (0004 not applied?)';
  end if;
  if not exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'identities_legacy_view'
  ) then
    raise exception '0004 postcheck failed: identities_legacy_view missing';
  end if;
end $$;

do $$
declare
  guest_count bigint;
  identity_count bigint;
  account_count bigint;
  external_count bigint;
  guest_account_count bigint;
  human_internal_count bigint;
  null_ids bigint;
  dup_accounts bigint;
  dup_guest_identity bigint;
  missing_fk bigint;
  stub_humans bigint;
  legacy_count bigint;
begin
  select count(*) into guest_count from guest_identities;
  select count(*) into identity_count from identities;
  select count(*) into account_count from identity_accounts;
  select count(*) into external_count from identities where identity_class = 'external';
  select count(*) into guest_account_count from identity_accounts where source = 'entra' and account_kind = 'guest';
  select count(*) into human_internal_count from identities where identity_class = 'human_internal';
  select count(*) into null_ids from guest_identities where identity_id is null;
  select count(*) into legacy_count from identities_legacy_view;

  select count(*) into dup_accounts
  from (
    select 1
    from identity_accounts
    group by tenant_id, source, source_object_id
    having count(*) > 1
  ) d;

  select count(*) into dup_guest_identity
  from (
    select 1
    from guest_identities
    where identity_id is not null
    group by identity_id
    having count(*) > 1
  ) d;

  select count(*) into missing_fk
  from guest_identities g
  left join identities i on i.id = g.identity_id
  where i.id is null;

  -- Inventoried internals have an entra user account. Stubs do not.
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

  if external_count is distinct from guest_count then
    raise exception '0004 postcheck failed: external identities (%) != guests (%)', external_count, guest_count;
  end if;
  if guest_account_count is distinct from guest_count then
    raise exception '0004 postcheck failed: guest accounts (%) != guests (%)', guest_account_count, guest_count;
  end if;
  if identity_count is distinct from (guest_count + human_internal_count) then
    raise exception '0004 postcheck failed: identities count (%) != guests (%) + human_internal (%)', identity_count, guest_count, human_internal_count;
  end if;
  if account_count is distinct from identity_count then
    raise exception '0004 postcheck failed: accounts count (%) != identities (%)', account_count, identity_count;
  end if;
  if null_ids <> 0 then
    raise exception '0004 postcheck failed: identity_id nulls = %', null_ids;
  end if;
  if dup_accounts <> 0 then
    raise exception '0004 postcheck failed: duplicate account keys = %', dup_accounts;
  end if;
  if dup_guest_identity <> 0 then
    raise exception '0004 postcheck failed: duplicate guest identity_id = %', dup_guest_identity;
  end if;
  if missing_fk <> 0 then
    raise exception '0004 postcheck failed: guests missing identities rows = %', missing_fk;
  end if;
  if stub_humans <> 0 then
    raise exception '0004 postcheck failed: human_internal stub identities = %', stub_humans;
  end if;
  if legacy_count is distinct from guest_count then
    raise exception '0004 postcheck failed: identities_legacy_view count (%) != guests (%)', legacy_count, guest_count;
  end if;
end $$;

select
  (select count(*) from guest_identities) as guest_count,
  (select count(*) from identities) as identity_count,
  (select count(*) from identity_accounts) as account_count,
  (select count(*) from guest_identities where identity_id is null) as identity_id_nulls,
  (select count(*) from identity_relations) as relation_count,
  (select count(*) from identities where identity_class = 'human_internal') as human_internal_count,
  (select count(*) from identities_legacy_view) as identities_legacy_view_count;
