-- AIGIS 0008 rollback. Restores NOT NULL on guest_id for the four tables.
-- Does not drop guest_id, guest_id FKs, unique (review_id, guest_id),
-- provision_governance_ids triggers, identities_legacy_view, or guest data.
--
-- Not part of the supabase migration chain. Owner-run only. Single
-- transaction: a failure leaves the catalog as it was.
--
-- If identity-only rows exist (guest_id null), this file raises and does
-- not alter the catalog. Roll back 0009+ and delete those rows first.
-- After this file: run supabase/sql/0008_precheck.sql to confirm the
-- post-0007 shape is back.

BEGIN;

do $$
declare
  t text;
  null_guests bigint;
begin
  foreach t in array array['resource_memberships', 'guest_activity', 'risk_scores', 'review_items']
  loop
    execute format('select count(*) from public.%I where guest_id is null', t) into null_guests;
    if null_guests <> 0 then
      raise exception 'roll back 0009+ and delete non-guest rows first';
    end if;
  end loop;
end $$;

drop index if exists review_items_review_identity_uidx;
drop index if exists review_items_review_assignment_uidx;

alter table if exists review_items drop constraint if exists review_items_role_assignment_subject_chk;
alter table if exists review_items drop constraint if exists review_items_subject_kind_chk;
alter table if exists review_items drop constraint if exists review_items_subject_present_chk;
alter table if exists resource_memberships drop constraint if exists resource_memberships_subject_present_chk;
alter table if exists guest_activity drop constraint if exists guest_activity_subject_present_chk;
alter table if exists risk_scores drop constraint if exists risk_scores_subject_present_chk;

alter table if exists review_items drop column if exists role_assignment_id;
alter table if exists review_items drop column if exists subject_kind;

alter table resource_memberships alter column guest_id set not null;
alter table guest_activity alter column guest_id set not null;
alter table risk_scores alter column guest_id set not null;
alter table review_items alter column guest_id set not null;

COMMIT;
