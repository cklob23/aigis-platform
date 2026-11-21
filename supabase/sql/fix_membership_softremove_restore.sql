-- Restore memberships soft-removed by prod scan a2c82ddb.
-- Owner-run only. Single transaction. Idempotent: only rows still holding
-- removed_at from that scan are updated. Does not touch Graph.
--
-- After this file: supabase/sql/fix_membership_softremove_postcheck.sql

BEGIN;

do $$
declare
  job_id uuid;
  job_tenant uuid;
  job_started timestamptz;
  job_completed timestamptz;
  job_count bigint;
  updated bigint;
begin
  select count(*) into job_count
  from scan_jobs
  where id::text like 'a2c82ddb%';

  if job_count <> 1 then
    raise exception 'fix_membership_softremove restore failed: expected 1 scan_jobs row matching a2c82ddb%%, found %', job_count;
  end if;

  select id, tenant_id, started_at, completed_at
    into job_id, job_tenant, job_started, job_completed
  from scan_jobs
  where id::text like 'a2c82ddb%';

  if job_started is null then
    raise exception 'fix_membership_softremove restore failed: scan a2c82ddb has no started_at';
  end if;

  update resource_memberships
  set removed_at = null
  where tenant_id = job_tenant
    and removed_at is not null
    and removed_at >= job_started
    and removed_at <= coalesce(job_completed, job_started + interval '15 minutes');

  get diagnostics updated = row_count;
  raise notice 'restored_rows=% (expect about 514 on first run, 0 on repeat)', updated;
end $$;

COMMIT;
