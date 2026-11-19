-- AIGIS 0008a precheck. Run against the post-0008 schema before applying
-- supabase/migrations/0008a_fix_provision_governance_ids.sql.
-- Owner-run only. Does not write.

do $$
declare
  src text;
  trigger_count bigint;
  nullable text;
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'provision_governance_ids'
  ) then
    raise exception '0008a precheck failed: provision_governance_ids missing (apply 0005 first)';
  end if;

  select c.is_nullable into nullable
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'risk_scores' and c.column_name = 'guest_id';
  if nullable is distinct from 'YES' then
    raise exception '0008a precheck failed: risk_scores.guest_id is_nullable = % (apply 0008 first)', nullable;
  end if;

  select count(*) into trigger_count
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'resource_memberships_provision_governance_ids',
      'guest_activity_provision_governance_ids',
      'risk_scores_provision_governance_ids',
      'risk_findings_provision_governance_ids',
      'review_items_provision_governance_ids',
      'remediation_actions_provision_governance_ids',
      'alerts_provision_governance_ids',
      'scan_changes_provision_governance_ids'
    );
  if trigger_count <> 8 then
    raise exception '0008a precheck failed: provision_governance_ids triggers = % (expected 8)', trigger_count;
  end if;

  select p.prosrc into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'provision_governance_ids';
  if src like '%if tg_table_name = ''resource_memberships'' then%' then
    raise exception '0008a precheck failed: nested resource_memberships check already present. If 0008a already applied, run 0008a_postcheck.sql or 0008a_rollback.sql first.';
  end if;
end $$;

select
  (select count(*) from pg_trigger where not tgisinternal and tgname like '%_provision_governance_ids') as trigger_count,
  (select length(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'provision_governance_ids') as function_src_len;
