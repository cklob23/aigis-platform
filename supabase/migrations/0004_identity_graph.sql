-- AIGIS Phase 1.5 PR1: identity graph schema
--
-- Owner applies this file to production. Do not run it from CI or an agent
-- against a remote database. There is no snapshot, so this script is wrapped
-- in a single transaction: any failed gate RAISE EXCEPTION rolls the whole
-- file back.
--
-- Q3: before dropping public.identities (a view since 0002), this file creates
-- public.identities_legacy_view with the same columns and the same guest
-- projection. External SQL that read `identities` should switch to
-- identities_legacy_view. The application never queried the view.
--
-- Defaults locked for this phase:
--   * no sponsor stub identities (owner_* is copied; owner_identity_id stays null)
--   * merge is schema-only (identity_relations.same_as is unused)
--   * AI recommend/explain is later work, off by default, on-demand
--   * guest_id columns stay (dual-write through 1.5)
--   * no autonomous access changes; existing monitor/enforce modes stay
--
-- Independently shippable: a BEFORE INSERT trigger provisions an identities
-- row plus an entra identity_accounts row when a guest is inserted without
-- identity_id, so existing scan upserts keep working until PR2 dual-writes.
--
-- Idempotent: safe to re-run after a successful apply (CREATE IF NOT EXISTS,
-- backfill only missing rows, constraint guards).
--
-- Companion scripts (not part of the supabase migration chain):
--   supabase/sql/0004_precheck.sql
--   supabase/sql/0004_postcheck.sql
--   supabase/sql/0004_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0004_precheck.sql
--   2. supabase/migrations/0004_identity_graph.sql
--   3. supabase/sql/0004_postcheck.sql
-- Rollback: supabase/sql/0004_rollback.sql, then the precheck.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Compatibility view (Q3). Same columns as 0002 `identities`.
-- ---------------------------------------------------------------------------
create or replace view identities_legacy_view as
select
  g.id,
  g.tenant_id,
  g.identity_class,
  g.external_type as identity_subtype,
  g.ms_object_id,
  g.display_name,
  g.email,
  g.upn,
  g.user_type as entra_user_type,
  g.account_enabled,
  g.external_organization_id,
  g.sponsor_ms_object_id as owner_ms_object_id,
  g.sponsor_display_name as owner_display_name,
  g.last_sign_in_at as last_activity_at,
  g.risk_score,
  g.risk_level,
  g.review_status,
  g.last_reviewed_at,
  g.first_seen_at,
  g.last_seen_at,
  g.removed_at
from guest_identities g;

comment on view identities_legacy_view is
  'Q3 compatibility: the 0002 identities view definition, renamed so 0004 can use the identities table. Same columns, still projected from guest_identities.';

-- Drop the old view only. Never DROP TABLE here.
do $$
begin
  if exists (
    select 1 from pg_views
    where schemaname = 'public' and viewname = 'identities'
  ) then
    execute 'drop view public.identities';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Hub, accounts, relations
-- ---------------------------------------------------------------------------
create table if not exists identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  identity_class text not null default 'external', -- human_internal | external | privileged | non_human | agent
  display_name text,
  primary_email text,
  status text not null default 'active', -- active | disabled | removed
  risk_score integer not null default 0,
  risk_level text not null default 'low',
  recommended_action text not null default 'keep',
  review_status text not null default 'never_reviewed',
  last_reviewed_at timestamptz,
  owner_identity_id uuid references identities(id) on delete set null,
  owner_kind text not null default 'none', -- sponsor | assigned | inferred | none
  owner_email text,
  owner_ms_object_id text,
  owner_display_name text,
  last_activity_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identities_tenant_class_idx on identities (tenant_id, identity_class);
create index if not exists identities_tenant_risk_idx on identities (tenant_id, risk_score desc);
create index if not exists identities_owner_ms_idx on identities (tenant_id, owner_ms_object_id);

comment on table identities is
  'AIGIS identity hub. Phase 1.5 backfills one row per guest_identities row (identity_class=external). Privileged, non-human, and agent classes are reserved. AI does not write this table.';

comment on column identities.owner_identity_id is
  'FK to another identities row when the owner is itself an inventoried identity. PR1 does not create sponsor stub identities, so this stays null for Entra sponsors.';

create table if not exists identity_accounts (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references identities(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null, -- entra now; later okta, aws, custom
  source_object_id text not null,
  account_kind text not null default 'guest', -- user | guest | sp | workload | agent
  upn text,
  enabled boolean not null default true,
  last_activity_at timestamptz,
  attrs jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, source, source_object_id)
);

create index if not exists identity_accounts_identity_idx on identity_accounts (tenant_id, identity_id);

comment on table identity_accounts is
  'Source-specific accounts hanging off the identity hub. PR1 writes one entra account per guest (source_object_id = guest_identities.ms_object_id).';

create table if not exists identity_relations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  from_identity_id uuid not null references identities(id) on delete cascade,
  to_identity_id uuid not null references identities(id) on delete cascade,
  relation_type text not null, -- owns | sponsors | same_as | created_by
  confidence numeric,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, from_identity_id, to_identity_id, relation_type)
);

comment on table identity_relations is
  'Typed edges between identities. same_as is reserved for merge (schema only in PR1; no UI and no backfill). sponsors/owns are not backfilled because PR1 does not invent human_internal stub identities.';

alter table identities enable row level security;
alter table identity_accounts enable row level security;
alter table identity_relations enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Link guest_identities (external extension) to the hub
-- ---------------------------------------------------------------------------
alter table guest_identities
  add column if not exists identity_id uuid;

create index if not exists guest_identities_identity_id_idx on guest_identities (identity_id);

-- Backfill: identity.id = guest.id so the 1:1 map is stable and idempotent.
insert into identities (
  id,
  tenant_id,
  identity_class,
  display_name,
  primary_email,
  status,
  risk_score,
  risk_level,
  recommended_action,
  review_status,
  last_reviewed_at,
  owner_identity_id,
  owner_kind,
  owner_email,
  owner_ms_object_id,
  owner_display_name,
  last_activity_at,
  first_seen_at,
  last_seen_at,
  removed_at
)
select
  g.id,
  g.tenant_id,
  coalesce(g.identity_class, 'external'),
  g.display_name,
  g.email,
  case
    when g.removed_at is not null then 'removed'
    when g.account_enabled then 'active'
    else 'disabled'
  end,
  g.risk_score,
  g.risk_level,
  g.recommended_action,
  g.review_status,
  g.last_reviewed_at,
  null,
  case
    when g.sponsor_ms_object_id is not null or coalesce(g.sponsor_email, '') <> '' then 'sponsor'
    else 'none'
  end,
  g.sponsor_email,
  g.sponsor_ms_object_id,
  g.sponsor_display_name,
  coalesce(g.last_sign_in_at, g.last_non_interactive_sign_in_at),
  g.first_seen_at,
  g.last_seen_at,
  g.removed_at
from guest_identities g
where not exists (select 1 from identities i where i.id = g.id);

insert into identity_accounts (
  identity_id,
  tenant_id,
  source,
  source_object_id,
  account_kind,
  upn,
  enabled,
  last_activity_at,
  first_seen_at,
  last_seen_at,
  removed_at
)
select
  g.id,
  g.tenant_id,
  'entra',
  g.ms_object_id,
  'guest',
  g.upn,
  g.account_enabled,
  coalesce(g.last_sign_in_at, g.last_non_interactive_sign_in_at),
  g.first_seen_at,
  g.last_seen_at,
  g.removed_at
from guest_identities g
where not exists (
  select 1
  from identity_accounts a
  where a.tenant_id = g.tenant_id
    and a.source = 'entra'
    and a.source_object_id = g.ms_object_id
);

update guest_identities
set identity_id = id
where identity_id is null;

-- Provision hub+account for guest inserts that omit identity_id (scan path until PR2).
create or replace function provision_identity_for_guest()
returns trigger
language plpgsql
as $$
begin
  if new.identity_id is not null then
    return new;
  end if;

  insert into identities (
    id,
    tenant_id,
    identity_class,
    display_name,
    primary_email,
    status,
    risk_score,
    risk_level,
    recommended_action,
    review_status,
    last_reviewed_at,
    owner_identity_id,
    owner_kind,
    owner_email,
    owner_ms_object_id,
    owner_display_name,
    last_activity_at,
    first_seen_at,
    last_seen_at,
    removed_at
  ) values (
    new.id,
    new.tenant_id,
    coalesce(new.identity_class, 'external'),
    new.display_name,
    new.email,
    case
      when new.removed_at is not null then 'removed'
      when new.account_enabled then 'active'
      else 'disabled'
    end,
    new.risk_score,
    new.risk_level,
    new.recommended_action,
    new.review_status,
    new.last_reviewed_at,
    null,
    case
      when new.sponsor_ms_object_id is not null or coalesce(new.sponsor_email, '') <> '' then 'sponsor'
      else 'none'
    end,
    new.sponsor_email,
    new.sponsor_ms_object_id,
    new.sponsor_display_name,
    coalesce(new.last_sign_in_at, new.last_non_interactive_sign_in_at),
    new.first_seen_at,
    new.last_seen_at,
    new.removed_at
  )
  on conflict (id) do nothing;

  insert into identity_accounts (
    identity_id,
    tenant_id,
    source,
    source_object_id,
    account_kind,
    upn,
    enabled,
    last_activity_at
  ) values (
    new.id,
    new.tenant_id,
    'entra',
    new.ms_object_id,
    'guest',
    new.upn,
    new.account_enabled,
    coalesce(new.last_sign_in_at, new.last_non_interactive_sign_in_at)
  )
  on conflict (tenant_id, source, source_object_id) do nothing;

  new.identity_id := new.id;
  return new;
end;
$$;

create or replace trigger guest_identities_provision_identity
  before insert on guest_identities
  for each row
  execute function provision_identity_for_guest();

-- ---------------------------------------------------------------------------
-- 4. In-transaction gates. Failure aborts and rolls back the whole file.
-- ---------------------------------------------------------------------------
do $$
declare
  guest_count bigint;
  identity_count bigint;
  account_count bigint;
  null_ids bigint;
  dup_accounts bigint;
  dup_guest_identity bigint;
  missing_fk bigint;
  stub_humans bigint;
begin
  select count(*) into guest_count from guest_identities;
  select count(*) into identity_count from identities;
  select count(*) into account_count from identity_accounts;
  select count(*) into null_ids from guest_identities where identity_id is null;

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

  select count(*) into stub_humans
  from identities
  where identity_class = 'human_internal';

  if identity_count is distinct from guest_count then
    raise exception '0004 gate failed: identities count (%) != guests (%)', identity_count, guest_count;
  end if;
  if account_count is distinct from guest_count then
    raise exception '0004 gate failed: accounts count (%) != guests (%)', account_count, guest_count;
  end if;
  if null_ids <> 0 then
    raise exception '0004 gate failed: guest_identities.identity_id nulls = %', null_ids;
  end if;
  if dup_accounts <> 0 then
    raise exception '0004 gate failed: duplicate identity_accounts (tenant_id, source, source_object_id) rows = %', dup_accounts;
  end if;
  if dup_guest_identity <> 0 then
    raise exception '0004 gate failed: duplicate guest_identities.identity_id values = %', dup_guest_identity;
  end if;
  if missing_fk <> 0 then
    raise exception '0004 gate failed: guests with identity_id not in identities = %', missing_fk;
  end if;
  if stub_humans <> 0 then
    raise exception '0004 gate failed: unexpected human_internal stub identities = %', stub_humans;
  end if;
end $$;

-- Constraints after gates so a uniqueness failure still rolls back with the data.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_identities_identity_id_fkey'
      and conrelid = 'public.guest_identities'::regclass
  ) then
    alter table guest_identities
      add constraint guest_identities_identity_id_fkey
      foreign key (identity_id) references identities(id);
  end if;
end $$;

alter table guest_identities
  alter column identity_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'guest_identities_identity_id_key'
      and conrelid = 'public.guest_identities'::regclass
  ) then
    alter table guest_identities
      add constraint guest_identities_identity_id_key unique (identity_id);
  end if;
end $$;

COMMIT;
