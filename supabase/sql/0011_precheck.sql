-- AIGIS 0011 precheck. Run against the post-0010 schema before applying
-- supabase/migrations/0011_privileged_risk_overlay.sql.
-- Owner-run only. Does not write.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'is_privileged'
  ) then
    raise exception '0011 precheck failed: identities.is_privileged missing (apply 0009 first)';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'group_pim_eligibilities'
  ) then
    raise exception '0011 precheck failed: group_pim_eligibilities missing (apply 0010 first)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'role_assignments' and column_name = 'starts_at'
  ) then
    raise exception '0011 precheck failed: role_assignments.starts_at missing (apply 0010 first)';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'identities' and column_name = 'risk_factors'
  ) then
    raise exception '0011 precheck failed: identities.risk_factors already exists. If 0011 already applied, run 0011_postcheck.sql or 0011_rollback.sql first.';
  end if;
end $$;

select
  (select count(*) from identities) as identities,
  (select count(*) from identities where is_privileged) as privileged_identities,
  (select count(*) from role_assignments) as role_assignments,
  (select count(*) from group_pim_eligibilities) as group_pim_eligibilities;
