-- Restore memberships soft-removed by the 1000-row cap bug on prod scan
-- a2c82ddb (Aditum, 2026-11-20 20:22-20:25 UTC).
--
-- Owner-run only. Does not write. Do not run from CI or an agent against a
-- remote database.
--
-- Columns: resource_memberships.removed_at. There is no removed_scan_id or
-- is_active. The scan set removed_at to runScan's `now` (just after
-- started_at). Expect about 514 rows.
--
-- Run order:
--   1. supabase/sql/fix_membership_softremove_precheck.sql
--   2. supabase/sql/fix_membership_softremove_restore.sql
--   3. supabase/sql/fix_membership_softremove_postcheck.sql

do $$
declare
  job_id uuid;
  job_started timestamptz;
  job_completed timestamptz;
  job_count bigint;
  hit_count bigint;
  active_count bigint;
begin
  select count(*) into job_count
  from scan_jobs
  where id::text like 'a2c82ddb%';

  if job_count <> 1 then
    raise exception 'fix_membership_softremove precheck failed: expected 1 scan_jobs row matching a2c82ddb%%, found %', job_count;
  end if;

  select id, started_at, completed_at into job_id, job_started, job_completed
  from scan_jobs
  where id::text like 'a2c82ddb%';

  if job_started is null then
    raise exception 'fix_membership_softremove precheck failed: scan a2c82ddb has no started_at';
  end if;

  select count(*) into hit_count
  from resource_memberships
  where tenant_id = (select tenant_id from scan_jobs where id = job_id)
    and removed_at is not null
    and removed_at >= job_started
    and removed_at <= coalesce(job_completed, job_started + interval '15 minutes');

  select count(*) into active_count
  from resource_memberships
  where tenant_id = (select tenant_id from scan_jobs where id = job_id)
    and removed_at is null;

  raise notice 'scan_job_id=% started_at=% completed_at=%', job_id, job_started, job_completed;
  raise notice 'rows_to_restore=% (expect about 514)', hit_count;
  raise notice 'active_memberships_now=% (expect about 2091 before restore, about 2605 after)', active_count;
end $$;

select
  m.id,
  m.guest_id,
  m.resource_id,
  m.membership_type,
  m.first_seen_at,
  m.last_seen_at,
  m.removed_at
from resource_memberships m
join scan_jobs j on j.tenant_id = m.tenant_id and j.id::text like 'a2c82ddb%'
where m.removed_at is not null
  and m.removed_at >= j.started_at
  and m.removed_at <= coalesce(j.completed_at, j.started_at + interval '15 minutes')
order by m.id
limit 20;

select
  (select count(*) from resource_memberships m
     join scan_jobs j on j.tenant_id = m.tenant_id and j.id::text like 'a2c82ddb%'
    where m.removed_at is not null
      and m.removed_at >= j.started_at
      and m.removed_at <= coalesce(j.completed_at, j.started_at + interval '15 minutes')) as rows_to_restore,
  (select count(*) from resource_memberships m
     join scan_jobs j on j.tenant_id = m.tenant_id and j.id::text like 'a2c82ddb%'
    where m.removed_at is null) as active_memberships;
