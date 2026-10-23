-- AIGIS Phase 1: External Identity Governance
--
-- Additive only. No tables or columns are dropped or renamed. Existing
-- `external_domains` and `guest_identities` keep their names so that every
-- current query, RLS policy, and demo seed continues to work. New columns
-- have defaults and are backfilled below so the application can rely on them.

-- ---------------------------------------------------------------------------
-- 1. External Organizations: a partner/vendor/client relationship that owns
--    one or more domains. Replaces "domain" as the primary unit of governance.
-- ---------------------------------------------------------------------------
create table if not exists external_organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  relationship_type text not null default 'unknown',  -- partner | vendor | contractor | client | temporary | unknown | former | blocked
  approval_state text not null default 'unreviewed',  -- unreviewed | approved | restricted | blocked
  business_owner text,
  business_owner_email text,
  review_date date,
  risk_level text not null default 'low',             -- derived from member identities on each scan
  notes text,
  seed_domain_id uuid,                                -- provenance: the domain this org was auto-created from (null if created manually)
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists external_organizations_tenant_idx on external_organizations (tenant_id, name);

alter table external_domains
  add column if not exists organization_id uuid references external_organizations(id) on delete set null;
create index if not exists external_domains_org_idx on external_domains (organization_id);

-- ---------------------------------------------------------------------------
-- 2. Identity generalization. `guest_identities` becomes the external-identity
--    extension of a future generalized identity model. Columns are nullable or
--    defaulted so existing rows and inserts stay valid.
-- ---------------------------------------------------------------------------
alter table guest_identities
  add column if not exists identity_class text not null default 'external',        -- human_internal | external | privileged | non_human | agent
  add column if not exists external_type text not null default 'b2b_guest',        -- b2b_guest | external_member | cross_tenant | contractor | partner | vendor | client | unknown
  add column if not exists classification_evidence jsonb not null default '[]'::jsonb,
  add column if not exists external_organization_id uuid references external_organizations(id) on delete set null;
create index if not exists guest_identities_tenant_org_idx on guest_identities (tenant_id, external_organization_id);

-- ---------------------------------------------------------------------------
-- 3. Backfill: one organization per existing domain, carrying over the
--    domain's classification, owner, review date and notes. Domain
--    classification is kept as-is for backwards compatibility and is now
--    treated as a per-domain override of the organization relationship.
-- ---------------------------------------------------------------------------
insert into external_organizations (tenant_id, seed_domain_id, name, relationship_type, approval_state, business_owner, review_date, notes, first_seen_at, last_seen_at)
select
  d.tenant_id,
  d.id,
  coalesce(
    (select mode() within group (order by g.company_name) from guest_identities g where g.tenant_id = d.tenant_id and g.domain = d.domain and g.company_name is not null and g.company_name <> ''),
    d.domain
  ),
  case d.classification
    when 'approved_partner' then 'partner'
    when 'vendor' then 'vendor'
    when 'contractor' then 'contractor'
    when 'client' then 'client'
    when 'temporary' then 'temporary'
    when 'blocked' then 'blocked'
    else 'unknown'
  end,
  case d.classification
    when 'blocked' then 'blocked'
    when 'unknown' then 'unreviewed'
    else 'approved'
  end,
  d.business_owner,
  d.review_date,
  d.notes,
  d.first_seen_at,
  d.last_seen_at
from external_domains d
where d.organization_id is null;

update external_domains d
set organization_id = o.id
from external_organizations o
where d.organization_id is null
  and o.seed_domain_id = d.id;

update guest_identities g
set external_organization_id = d.organization_id
from external_domains d
where g.external_organization_id is null
  and d.id = g.external_domain_id
  and d.organization_id is not null;

-- Evidence for existing rows is derived from the Microsoft attributes we already hold.
update guest_identities
set
  external_type = case when user_type = 'Guest' then 'b2b_guest' else 'external_member' end,
  classification_evidence = jsonb_build_array(
    jsonb_build_object('source', 'entra', 'attribute', 'userType', 'value', user_type,
      'statement', 'Microsoft Entra userType = ' || user_type)
  )
where classification_evidence = '[]'::jsonb;

-- Organization risk = highest risk level across active member identities.
update external_organizations o
set risk_level = coalesce((
  select case
    when bool_or(g.risk_level = 'critical') then 'critical'
    when bool_or(g.risk_level = 'high') then 'high'
    when bool_or(g.risk_level = 'medium') then 'medium'
    else 'low' end
  from guest_identities g
  where g.external_organization_id = o.id and g.removed_at is null
), 'low');

-- ---------------------------------------------------------------------------
-- 4. Security: same deny-all RLS posture as every other table. The app uses
--    the service role server-side and scopes every query by tenant_id.
-- ---------------------------------------------------------------------------
alter table external_organizations enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Compatibility view exposing the generalized identity vocabulary without
--    renaming the underlying table. Later phases add rows from other identity
--    classes via union; Phase 1 consumers may read from either name.
-- ---------------------------------------------------------------------------
create or replace view identities as
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

comment on view identities is 'AIGIS generalized identity view. Phase 1 projects external identities from guest_identities; later phases union privileged, non-human and agent identities.';
