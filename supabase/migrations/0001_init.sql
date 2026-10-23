-- GuestSweep core schema
-- All tenant-scoped tables carry tenant_id. Application access goes through the
-- server-side service-role client with explicit tenant scoping; RLS is enabled
-- with no anon/authenticated policies so the public API surface is deny-all.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  msp_mode boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan text not null default 'trial',
  status text not null default 'active',
  seats integer not null default 1,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  ms_tenant_id text not null unique,
  display_name text not null,
  primary_domain text,
  verified_domains jsonb not null default '[]'::jsonb,
  connection_status text not null default 'pending', -- pending | consent_required | connected | error
  consent_granted_at timestamptz,
  onboarding_step integer not null default 1,
  onboarding_completed_at timestamptz,
  last_scan_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  ms_object_id text unique,
  ms_tenant_id text,
  email text not null,
  display_name text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists roles (
  key text primary key,
  name text not null,
  description text not null,
  rank integer not null
);

insert into roles (key, name, description, rank) values
  ('global_admin', 'Global Administrator', 'Full control across all tenants in the organization, including billing and administrators.', 100),
  ('gs_admin', 'GuestSweep Administrator', 'Full control of a tenant: scans, policies, remediation, reviews, and settings.', 80),
  ('security_analyst', 'Security Analyst', 'Can run scans, triage findings, create and decide access reviews, and request remediation.', 60),
  ('auditor', 'Auditor', 'Read access to all data plus audit log and report exports.', 40),
  ('read_only', 'Read Only', 'View-only access to dashboards and inventories.', 20)
on conflict (key) do nothing;

create table if not exists administrators (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_key text not null references roles(key),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  provider text not null default 'microsoft',
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, provider)
);

create table if not exists external_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  domain text not null,
  classification text not null default 'unknown', -- approved_partner | vendor | contractor | client | temporary | unknown | blocked
  business_owner text,
  review_date date,
  notes text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, domain)
);

create table if not exists guest_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ms_object_id text not null,
  display_name text,
  email text,
  upn text,
  domain text,
  external_domain_id uuid references external_domains(id) on delete set null,
  company_name text,
  account_enabled boolean not null default true,
  invitation_status text, -- PendingAcceptance | Accepted
  user_type text not null default 'Guest',
  created_at_ms timestamptz,
  last_sign_in_at timestamptz,
  last_non_interactive_sign_in_at timestamptz,
  auth_methods jsonb not null default '[]'::jsonb,
  sponsor_ms_object_id text,
  sponsor_display_name text,
  sponsor_email text,
  sponsor_enabled boolean,
  risk_score integer not null default 0,
  risk_level text not null default 'low',
  risk_factors jsonb not null default '[]'::jsonb,
  recommended_action text not null default 'keep', -- keep | review | remove_selected | disable | remove
  review_status text not null default 'never_reviewed', -- never_reviewed | pending | approved | removed | extended | investigating
  last_reviewed_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (tenant_id, ms_object_id)
);
create index if not exists guest_identities_tenant_risk_idx on guest_identities (tenant_id, risk_score desc);
create index if not exists guest_identities_tenant_domain_idx on guest_identities (tenant_id, domain);
create index if not exists guest_identities_tenant_last_sign_in_idx on guest_identities (tenant_id, last_sign_in_at);

create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  ms_object_id text not null,
  resource_type text not null, -- team | m365_group | sharepoint_site | enterprise_app | security_group
  display_name text not null,
  description text,
  visibility text,
  web_url text,
  mail text,
  is_sensitive boolean not null default false,
  sensitivity_category text, -- finance | hr | clinical | executive | legal | rnd | other
  internal_member_count integer not null default 0,
  external_member_count integer not null default 0,
  owners jsonb not null default '[]'::jsonb,
  linked_resource_id uuid references resources(id) on delete set null, -- e.g. the Team's SharePoint site
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (tenant_id, ms_object_id, resource_type)
);
create index if not exists resources_tenant_type_idx on resources (tenant_id, resource_type);

create or replace view teams as select * from resources where resource_type = 'team';
create or replace view m365_groups as select * from resources where resource_type = 'm365_group';
create or replace view sharepoint_sites as select * from resources where resource_type = 'sharepoint_site';
create or replace view enterprise_apps as select * from resources where resource_type = 'enterprise_app';

create table if not exists resource_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid not null references guest_identities(id) on delete cascade,
  resource_id uuid not null references resources(id) on delete cascade,
  membership_type text not null default 'member', -- member | owner
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (tenant_id, guest_id, resource_id)
);
create index if not exists resource_memberships_resource_idx on resource_memberships (tenant_id, resource_id);
create index if not exists resource_memberships_guest_idx on resource_memberships (tenant_id, guest_id);

create table if not exists guest_activity (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid not null references guest_identities(id) on delete cascade,
  activity_type text not null, -- sign_in | membership_added | membership_removed | sponsor_changed | disabled | enabled | reviewed | scanned
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index if not exists guest_activity_guest_idx on guest_activity (tenant_id, guest_id, occurred_at desc);

create table if not exists scan_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scan_type text not null, -- initial_full | incremental | manual | scheduled
  status text not null default 'queued', -- queued | running | completed | failed | cancelled
  progress jsonb not null default '{}'::jsonb,
  started_by uuid references users(id),
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists scan_jobs_tenant_idx on scan_jobs (tenant_id, created_at desc);

create table if not exists scan_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scan_job_id uuid references scan_jobs(id) on delete set null,
  snapshot jsonb not null, -- metrics snapshot for trending
  created_at timestamptz not null default now()
);
create index if not exists scan_results_tenant_idx on scan_results (tenant_id, created_at);

create table if not exists scan_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  scan_job_id uuid references scan_jobs(id) on delete cascade,
  change_type text not null, -- new_guest | removed_guest | new_membership | removed_membership | new_domain | guest_disabled | guest_enabled | sponsor_changed | risk_increase | risk_decrease
  guest_id uuid references guest_identities(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists risk_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid not null references guest_identities(id) on delete cascade,
  scan_job_id uuid references scan_jobs(id) on delete set null,
  score integer not null,
  level text not null,
  factors jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now()
);
create index if not exists risk_scores_guest_idx on risk_scores (tenant_id, guest_id, calculated_at desc);

create table if not exists risk_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid references guest_identities(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  external_domain_id uuid references external_domains(id) on delete cascade,
  severity text not null, -- critical | high | medium | low
  finding_type text not null,
  title text not null,
  description text,
  status text not null default 'open', -- open | resolved | dismissed
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists risk_findings_tenant_idx on risk_findings (tenant_id, status, created_at desc);

create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  rule_type text not null, -- inactive_days | never_signed_in | no_sponsor | sponsor_disabled | guest_age | no_recent_review | unapproved_domain | broad_access | disabled_with_memberships | former_vendor | expired_temporary
  config jsonb not null default '{}'::jsonb,
  action text not null default 'flag', -- flag | create_review | notify | recommend_removal | disable | remove
  severity text not null default 'medium',
  enabled boolean not null default true,
  automation_enabled boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists access_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active', -- draft | active | completed | cancelled
  scope jsonb not null default '{}'::jsonb,
  created_by uuid references users(id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  review_id uuid not null references access_reviews(id) on delete cascade,
  guest_id uuid not null references guest_identities(id) on delete cascade,
  status text not null default 'pending', -- pending | decided | actioned
  decision text, -- approve | remove | extend | investigate
  final_action text,
  resources_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (review_id, guest_id)
);
create index if not exists review_items_review_idx on review_items (tenant_id, review_id, status);

create table if not exists review_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  review_item_id uuid not null references review_items(id) on delete cascade,
  reviewer_user_id uuid references users(id),
  reviewer_email text,
  decision text not null,
  comment text,
  resources_reviewed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists remediation_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  guest_id uuid references guest_identities(id) on delete set null,
  action_type text not null, -- remove_from_resources | disable_guest | remove_all_access | delete_guest
  target_resources jsonb not null default '[]'::jsonb,
  status text not null default 'pending', -- pending | approved | executing | completed | failed | cancelled
  requested_by uuid references users(id),
  reason text,
  executed_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  alert_type text not null,
  severity text not null default 'medium',
  title text not null,
  description text,
  guest_id uuid references guest_identities(id) on delete cascade,
  resource_id uuid references resources(id) on delete cascade,
  status text not null default 'open', -- open | acknowledged | resolved
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
create index if not exists alerts_tenant_idx on alerts (tenant_id, status, created_at desc);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  actor_user_id uuid references users(id),
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  source_ip text,
  correlation_id text,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_tenant_idx on audit_events (tenant_id, created_at desc);

-- Deny-all RLS. Only the server-side service role reaches these tables.
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
      and tablename in ('organizations','subscriptions','tenants','users','roles','administrators','oauth_tokens',
        'external_domains','guest_identities','resources','resource_memberships','guest_activity','scan_jobs',
        'scan_results','scan_changes','risk_scores','risk_findings','policies','access_reviews','review_items',
        'review_decisions','remediation_actions','alerts','audit_events')
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
