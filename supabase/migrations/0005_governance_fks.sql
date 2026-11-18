-- AIGIS Phase 1.5 PR3: governance FKs
--
-- Owner applies this file to production. Do not run it from CI or an agent
-- against a remote database. There is no snapshot, so this script is wrapped
-- in a single transaction: any failed gate RAISE EXCEPTION rolls the whole
-- file back.
--
-- Additive nullable identity_id on review/remediation/risk/alert/membership/
-- activity/scan_change rows, plus account_id on resource_memberships.
-- Backfill from guest_identities.identity_id (and the entra identity_accounts
-- row). Do not drop guest_id.
--
-- Independently shippable: a BEFORE INSERT OR UPDATE trigger fills identity_id
-- (and membership account_id) from guest_id when omitted, so current writers
-- keep working until the app dual-write deploy.
--
-- Idempotent: safe to re-run after a successful apply (IF NOT EXISTS,
-- backfill only missing rows, constraint guards).
--
-- Companion scripts (not part of the supabase migration chain):
--   supabase/sql/0005_precheck.sql
--   supabase/sql/0005_postcheck.sql
--   supabase/sql/0005_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0005_precheck.sql
--   2. supabase/migrations/0005_governance_fks.sql
--   3. supabase/sql/0005_postcheck.sql
-- Rollback: supabase/sql/0005_rollback.sql, then the precheck.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Additive columns. guest_id stays.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'resource_memberships',
    'guest_activity',
    'risk_scores',
    'risk_findings',
    'review_items',
    'remediation_actions',
    'alerts',
    'scan_changes'
  ]
  loop
    execute format('alter table public.%I add column if not exists identity_id uuid', t);
    execute format(
      'create index if not exists %I on public.%I (tenant_id, identity_id)',
      t || '_identity_idx',
      t
    );
  end loop;
end $$;

alter table resource_memberships
  add column if not exists account_id uuid;
create index if not exists resource_memberships_account_idx
  on resource_memberships (tenant_id, account_id);

comment on column resource_memberships.identity_id is
  'Dual-write hub key. guest_id stays through Phase 1.5. Populated from guest_identities.identity_id.';
comment on column resource_memberships.account_id is
  'Entra identity_accounts row that holds this membership. Nullable until backfill; app dual-writes after 0005.';

-- ---------------------------------------------------------------------------
-- 2. Backfill from guest_id. Only fills nulls so a re-run is a no-op.
-- ---------------------------------------------------------------------------
update resource_memberships m
set identity_id = g.identity_id
from guest_identities g
where m.guest_id = g.id
  and m.identity_id is null;

update guest_activity a
set identity_id = g.identity_id
from guest_identities g
where a.guest_id = g.id
  and a.identity_id is null;

update risk_scores s
set identity_id = g.identity_id
from guest_identities g
where s.guest_id = g.id
  and s.identity_id is null;

update risk_findings f
set identity_id = g.identity_id
from guest_identities g
where f.guest_id = g.id
  and f.identity_id is null;

update review_items r
set identity_id = g.identity_id
from guest_identities g
where r.guest_id = g.id
  and r.identity_id is null;

update remediation_actions a
set identity_id = g.identity_id
from guest_identities g
where a.guest_id = g.id
  and a.identity_id is null;

update alerts a
set identity_id = g.identity_id
from guest_identities g
where a.guest_id = g.id
  and a.identity_id is null;

update scan_changes c
set identity_id = g.identity_id
from guest_identities g
where c.guest_id = g.id
  and c.identity_id is null;

update resource_memberships m
set account_id = a.id
from identity_accounts a
where a.identity_id = m.identity_id
  and a.source = 'entra'
  and m.account_id is null
  and m.identity_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Safety-net trigger: fill omitted identity_id / account_id from guest_id.
-- ---------------------------------------------------------------------------
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

create or replace trigger resource_memberships_provision_governance_ids
  before insert or update of guest_id, identity_id, account_id on resource_memberships
  for each row execute function provision_governance_ids();

create or replace trigger guest_activity_provision_governance_ids
  before insert or update of guest_id, identity_id on guest_activity
  for each row execute function provision_governance_ids();

create or replace trigger risk_scores_provision_governance_ids
  before insert or update of guest_id, identity_id on risk_scores
  for each row execute function provision_governance_ids();

create or replace trigger risk_findings_provision_governance_ids
  before insert or update of guest_id, identity_id on risk_findings
  for each row execute function provision_governance_ids();

create or replace trigger review_items_provision_governance_ids
  before insert or update of guest_id, identity_id on review_items
  for each row execute function provision_governance_ids();

create or replace trigger remediation_actions_provision_governance_ids
  before insert or update of guest_id, identity_id on remediation_actions
  for each row execute function provision_governance_ids();

create or replace trigger alerts_provision_governance_ids
  before insert or update of guest_id, identity_id on alerts
  for each row execute function provision_governance_ids();

create or replace trigger scan_changes_provision_governance_ids
  before insert or update of guest_id, identity_id on scan_changes
  for each row execute function provision_governance_ids();

-- ---------------------------------------------------------------------------
-- 4. In-transaction gates. Failure aborts and rolls back the whole file.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  guest_nulls bigint;
  mismatched bigint;
  missing_fk bigint;
  account_nulls bigint;
  account_mismatch bigint;
  guest_col_missing boolean;
begin
  foreach t in array array[
    'resource_memberships',
    'guest_activity',
    'risk_scores',
    'risk_findings',
    'review_items',
    'remediation_actions',
    'alerts',
    'scan_changes'
  ]
  loop
    execute format(
      'select count(*) from public.%I where guest_id is not null and identity_id is null',
      t
    ) into guest_nulls;
    if guest_nulls <> 0 then
      raise exception '0005 gate failed: %.identity_id nulls where guest_id is set = %', t, guest_nulls;
    end if;

    execute format(
      'select count(*)
       from public.%I r
       join guest_identities g on g.id = r.guest_id
       where r.guest_id is not null
         and r.identity_id is distinct from g.identity_id',
      t
    ) into mismatched;
    if mismatched <> 0 then
      raise exception '0005 gate failed: %.identity_id mismatches guest_identities.identity_id = %', t, mismatched;
    end if;

    execute format(
      'select count(*)
       from public.%I r
       left join identities i on i.id = r.identity_id
       where r.identity_id is not null and i.id is null',
      t
    ) into missing_fk;
    if missing_fk <> 0 then
      raise exception '0005 gate failed: %.identity_id not in identities = %', t, missing_fk;
    end if;

    select not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'guest_id'
    ) into guest_col_missing;
    if guest_col_missing then
      raise exception '0005 gate failed: %.guest_id is missing (must keep dual-write)', t;
    end if;
  end loop;

  select count(*) into account_nulls
  from resource_memberships
  where guest_id is not null and account_id is null;
  if account_nulls <> 0 then
    raise exception '0005 gate failed: resource_memberships.account_id nulls = %', account_nulls;
  end if;

  select count(*) into account_mismatch
  from resource_memberships m
  left join identity_accounts a on a.id = m.account_id
  where m.account_id is not null
    and (
      a.id is null
      or a.identity_id is distinct from m.identity_id
      or a.source is distinct from 'entra'
    );
  if account_mismatch <> 0 then
    raise exception '0005 gate failed: resource_memberships.account_id mismatches entra account = %', account_mismatch;
  end if;
end $$;

-- Constraints after gates so a uniqueness/FK failure still rolls back with the data.
do $$
declare
  t text;
  fk_name text;
begin
  foreach t in array array[
    'resource_memberships',
    'guest_activity',
    'risk_scores',
    'risk_findings',
    'review_items',
    'remediation_actions',
    'alerts',
    'scan_changes'
  ]
  loop
    fk_name := t || '_identity_id_fkey';
    if not exists (
      select 1 from pg_constraint
      where pg_constraint.conname = fk_name
        and conrelid = ('public.' || t)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (identity_id) references identities(id) on delete set null',
        t,
        fk_name
      );
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'resource_memberships_account_id_fkey'
      and conrelid = 'public.resource_memberships'::regclass
  ) then
    alter table resource_memberships
      add constraint resource_memberships_account_id_fkey
      foreign key (account_id) references identity_accounts(id) on delete set null;
  end if;
end $$;

COMMIT;
