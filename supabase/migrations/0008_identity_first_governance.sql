-- AIGIS Phase 2 PR1: identity-first governance
--
-- Owner applies this file to production after 0007. Do not run it from CI or
-- an agent against a remote database. No snapshot: a single BEGIN/COMMIT
-- transaction; any failed gate RAISE EXCEPTION rolls the whole file back.
--
-- Makes guest_id nullable on resource_memberships, guest_activity, risk_scores,
-- and review_items so a row can be keyed by identity_id alone. Does not drop
-- guest_id, guest_id FKs, unique (review_id, guest_id), or the
-- provision_governance_ids triggers. Does not touch identities_legacy_view
-- or existing guest data.
--
-- review_items can target a role assignment via nullable role_assignment_id
-- (no FK; 0009 adds role tables) and subject_kind.
--
-- Companion scripts:
--   supabase/sql/0008_precheck.sql
--   supabase/sql/0008_postcheck.sql
--   supabase/sql/0008_rollback.sql
--
-- Run order for the owner:
--   1. supabase/sql/0008_precheck.sql
--   2. supabase/migrations/0008_identity_first_governance.sql
--   3. supabase/sql/0008_postcheck.sql
-- Rollback: supabase/sql/0008_rollback.sql, then the precheck.

BEGIN;

create temporary table aigis_0008_baseline on commit drop as
select
  (select count(*) from resource_memberships) as resource_memberships,
  (select count(*) from guest_activity) as guest_activity,
  (select count(*) from risk_scores) as risk_scores,
  (select count(*) from review_items) as review_items,
  (select count(*) from identities_legacy_view) as identities_legacy_view,
  (select count(*) from guest_identities) as guest_identities;

alter table resource_memberships alter column guest_id drop not null;
alter table guest_activity alter column guest_id drop not null;
alter table risk_scores alter column guest_id drop not null;
alter table review_items alter column guest_id drop not null;

alter table resource_memberships
  add constraint resource_memberships_subject_present_chk
  check (guest_id is not null or identity_id is not null);

alter table guest_activity
  add constraint guest_activity_subject_present_chk
  check (guest_id is not null or identity_id is not null);

alter table risk_scores
  add constraint risk_scores_subject_present_chk
  check (guest_id is not null or identity_id is not null);

alter table review_items
  add constraint review_items_subject_present_chk
  check (guest_id is not null or identity_id is not null);

alter table review_items
  add column subject_kind text not null default 'identity';

alter table review_items
  add column role_assignment_id uuid;

alter table review_items
  add constraint review_items_subject_kind_chk
  check (subject_kind in ('identity', 'role_assignment'));

alter table review_items
  add constraint review_items_role_assignment_subject_chk
  check (
    subject_kind <> 'role_assignment'
    or (role_assignment_id is not null and identity_id is not null)
  );

create unique index if not exists review_items_review_identity_uidx
  on review_items (review_id, identity_id)
  where subject_kind = 'identity';

create unique index if not exists review_items_review_assignment_uidx
  on review_items (review_id, role_assignment_id)
  where role_assignment_id is not null;

comment on column review_items.subject_kind is
  'identity (default, guest or hub row) or role_assignment (0009).';
comment on column review_items.role_assignment_id is
  'Optional role assignment subject. No FK in 0008; 0009 adds role tables.';

do $$
declare
  baseline aigis_0008_baseline%rowtype;
  t text;
  both_null bigint;
  bad_kind bigint;
  bad_assignment bigint;
  memberships_after bigint;
  activity_after bigint;
  scores_after bigint;
  items_after bigint;
  legacy_after bigint;
  guests_after bigint;
begin
  select * into strict baseline from aigis_0008_baseline;

  foreach t in array array['resource_memberships', 'guest_activity', 'risk_scores', 'review_items']
  loop
    execute format(
      'select count(*) from public.%I where guest_id is null and identity_id is null',
      t
    ) into both_null;
    if both_null <> 0 then
      raise exception '0008 gate failed: % rows missing both guest_id and identity_id = %', t, both_null;
    end if;
  end loop;

  select count(*) into bad_kind
  from review_items
  where subject_kind is null or subject_kind not in ('identity', 'role_assignment');
  if bad_kind <> 0 then
    raise exception '0008 gate failed: review_items.subject_kind out of range = %', bad_kind;
  end if;

  select count(*) into bad_assignment
  from review_items
  where subject_kind = 'role_assignment'
    and (role_assignment_id is null or identity_id is null);
  if bad_assignment <> 0 then
    raise exception '0008 gate failed: role_assignment rows missing ids = %', bad_assignment;
  end if;

  select count(*) into memberships_after from resource_memberships;
  select count(*) into activity_after from guest_activity;
  select count(*) into scores_after from risk_scores;
  select count(*) into items_after from review_items;
  select count(*) into legacy_after from identities_legacy_view;
  select count(*) into guests_after from guest_identities;

  if memberships_after is distinct from baseline.resource_memberships then
    raise exception '0008 gate failed: resource_memberships count % != baseline %', memberships_after, baseline.resource_memberships;
  end if;
  if activity_after is distinct from baseline.guest_activity then
    raise exception '0008 gate failed: guest_activity count % != baseline %', activity_after, baseline.guest_activity;
  end if;
  if scores_after is distinct from baseline.risk_scores then
    raise exception '0008 gate failed: risk_scores count % != baseline %', scores_after, baseline.risk_scores;
  end if;
  if items_after is distinct from baseline.review_items then
    raise exception '0008 gate failed: review_items count % != baseline %', items_after, baseline.review_items;
  end if;
  if legacy_after is distinct from baseline.identities_legacy_view then
    raise exception '0008 gate failed: identities_legacy_view count changed';
  end if;
  if guests_after is distinct from baseline.guest_identities then
    raise exception '0008 gate failed: guest_identities count changed';
  end if;
end $$;

COMMIT;
