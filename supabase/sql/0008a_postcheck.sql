-- AIGIS 0008a post-check. Run after supabase/migrations/0008a_fix_provision_governance_ids.sql
-- commits. Owner-run only. Does not write.

do $$
declare
  src text;
  trigger_count bigint;
begin
  select p.prosrc into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'provision_governance_ids';
  if src is null then
    raise exception '0008a postcheck failed: provision_governance_ids missing';
  end if;
  if src not like '%if tg_table_name = ''resource_memberships'' then%' then
    raise exception '0008a postcheck failed: resource_memberships check is not nested';
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
    raise exception '0008a postcheck failed: provision_governance_ids triggers = % (expected 8)', trigger_count;
  end if;
end $$;

select
  (select count(*) from pg_trigger where not tgisinternal and tgname like '%_provision_governance_ids') as trigger_count;
