-- Postcheck after restoring memberships from scan a2c82ddb.
-- Owner-run only. Does not write.
-- Active count expect about 2605. Remaining rows matching the scan window
-- should be 0.

do $$
declare
  job_id uuid;
  job_count bigint;
  leftover bigint;
  active_count bigint;
begin
  select count(*) into job_count
  from scan_jobs
  where id::text like 'a2c82ddb%';

  if job_count <> 1 then
    raise exception 'fix_membership_softremove postcheck failed: expected 1 scan_jobs row matching a2c82ddb%%, found %', job_count;
  end if;

  select id into job_id from scan_jobs where id::text like 'a2c82ddb%';

  select count(*) into leftover
  from resource_memberships m
  join scan_jobs j on j.id = job_id and j.tenant_id = m.tenant_id
  where m.removed_at is not null
    and m.removed_at >= j.started_at
    and m.removed_at <= coalesce(j.completed_at, j.started_at + interval '15 minutes');

  select count(*) into active_count
  from resource_memberships
  where tenant_id = (select tenant_id from scan_jobs where id = job_id)
    and removed_at is null;

  raise notice 'leftover_from_scan=% (expect 0)', leftover;
  raise notice 'active_memberships=% (expect about 2605)', active_count;
end $$;

select
  (select count(*) from resource_memberships m
     join scan_jobs j on j.tenant_id = m.tenant_id and j.id::text like 'a2c82ddb%'
    where m.removed_at is not null
      and m.removed_at >= j.started_at
      and m.removed_at <= coalesce(j.completed_at, j.started_at + interval '15 minutes')) as leftover_from_scan,
  (select count(*) from resource_memberships m
     join scan_jobs j on j.tenant_id = m.tenant_id and j.id::text like 'a2c82ddb%'
    where m.removed_at is null) as active_memberships;
