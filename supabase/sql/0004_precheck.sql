-- AIGIS 0004 precheck. Run against the 0001-0003 schema before applying
-- supabase/migrations/0004_identity_graph.sql.
--
-- Not part of the supabase migration chain. Owner-run only. Does not write.
-- Aborts if the catalog is not in the expected pre-0004 shape (identities is
-- still a view). After a successful 0004 apply, run 0004_postcheck.sql instead.

do $$
begin
  if to_regclass('public.guest_identities') is null then
    raise exception '0004 precheck failed: guest_identities is missing';
  end if;
  if not exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'identities'
  ) then
    raise exception '0004 precheck failed: identities is not a view. If 0004 already applied, run 0004_postcheck.sql or 0004_rollback.sql first.';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'guest_identities'
      and column_name = 'identity_id'
  ) then
    raise exception '0004 precheck failed: guest_identities.identity_id already exists';
  end if;
end $$;

select
  (select count(*) from guest_identities) as guest_count,
  (select count(*) from identities) as identities_view_count,
  (select count(*) from guest_identities where identity_class is distinct from 'external') as non_external_guests,
  exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'identities'
  ) as identities_is_view;
