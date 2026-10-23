-- AIGIS Phase 2: Alert rules, email delivery, and review approval workflow
--
-- Additive only. Existing tables keep their shape; new columns are nullable
-- or defaulted so every current query and the demo seed keep working.

-- ---------------------------------------------------------------------------
-- 1. Alert rules: admin-defined conditions evaluated after every scan (and by
--    the daily cron for time-based triggers). Each firing produces an `alerts`
--    row and, when email is enabled on the rule, a Graph sendMail call.
-- ---------------------------------------------------------------------------
create table if not exists alert_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  trigger_type text not null,                 -- new_external_identity | risk_level | unapproved_organization | sensitive_access | inactive_identity | review_overdue | scan_failed
  conditions jsonb not null default '{}'::jsonb,
  severity text not null default 'medium',    -- critical | high | medium | low
  recipients jsonb not null default '[]'::jsonb, -- email addresses
  notify_email boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references users(id),
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists alert_rules_tenant_idx on alert_rules (tenant_id, enabled);
alter table alert_rules enable row level security;

alter table alerts
  add column if not exists rule_id uuid references alert_rules(id) on delete set null,
  add column if not exists dedupe_key text,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;
-- NULL dedupe keys are distinct, so legacy/manual alerts without a key are unaffected.
create unique index if not exists alerts_dedupe_idx on alerts (tenant_id, dedupe_key);

-- ---------------------------------------------------------------------------
-- 2. Email delivery log: every outbound message (alerts, review notices,
--    approval requests, test sends) with its Graph result.
-- ---------------------------------------------------------------------------
create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null,                         -- alert | review_approval_request | review_assigned | review_decision | review_reminder | test
  recipients jsonb not null default '[]'::jsonb,
  subject text not null,
  status text not null default 'sent',        -- sent | failed
  error text,
  sender text,
  related_type text,
  related_id text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_tenant_idx on email_log (tenant_id, created_at desc);
alter table email_log enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Review approval workflow. A review may need an administrator's sign-off
--    before reviewers are notified and decisions can be recorded.
-- ---------------------------------------------------------------------------
alter table access_reviews
  add column if not exists approval_status text not null default 'not_required', -- not_required | pending | approved | rejected
  add column if not exists approval_requested_at timestamptz,
  add column if not exists approved_by uuid references users(id),
  add column if not exists approved_by_email text,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text,
  add column if not exists reviewer_emails jsonb not null default '[]'::jsonb,
  add column if not exists reviewers_notified_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists created_by_email text;
create index if not exists access_reviews_approval_idx on access_reviews (tenant_id, approval_status);

-- ---------------------------------------------------------------------------
-- 4. Company provenance for external identities. `company_name` may now be
--    derived from the email domain when Graph has none and the domain is not
--    a consumer mail provider.
-- ---------------------------------------------------------------------------
alter table guest_identities
  add column if not exists company_source text; -- graph | domain | null
update guest_identities set company_source = 'graph' where company_source is null and company_name is not null and company_name <> '';
