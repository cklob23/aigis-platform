-- AIGIS 0005 rollback. Removes governance identity_id / account_id columns
-- and the provision_governance_ids trigger. Does not drop guest_id.
--
-- Not part of the supabase migration chain (a numbered migration named
-- 0005_rollback.sql would be applied as a forward migration). Owner-run only.
-- Single transaction: a failure leaves the catalog as it was.
--
-- Idempotent: safe if 0005 was never applied or was already rolled back.
-- After this file: run supabase/sql/0005_precheck.sql to confirm the
-- post-0004 shape is back, then re-apply 0005_governance_fks.sql if needed.

BEGIN;

drop trigger if exists resource_memberships_provision_governance_ids on resource_memberships;
drop trigger if exists guest_activity_provision_governance_ids on guest_activity;
drop trigger if exists risk_scores_provision_governance_ids on risk_scores;
drop trigger if exists risk_findings_provision_governance_ids on risk_findings;
drop trigger if exists review_items_provision_governance_ids on review_items;
drop trigger if exists remediation_actions_provision_governance_ids on remediation_actions;
drop trigger if exists alerts_provision_governance_ids on alerts;
drop trigger if exists scan_changes_provision_governance_ids on scan_changes;
drop function if exists provision_governance_ids();

alter table if exists resource_memberships drop constraint if exists resource_memberships_identity_id_fkey;
alter table if exists resource_memberships drop constraint if exists resource_memberships_account_id_fkey;
alter table if exists guest_activity drop constraint if exists guest_activity_identity_id_fkey;
alter table if exists risk_scores drop constraint if exists risk_scores_identity_id_fkey;
alter table if exists risk_findings drop constraint if exists risk_findings_identity_id_fkey;
alter table if exists review_items drop constraint if exists review_items_identity_id_fkey;
alter table if exists remediation_actions drop constraint if exists remediation_actions_identity_id_fkey;
alter table if exists alerts drop constraint if exists alerts_identity_id_fkey;
alter table if exists scan_changes drop constraint if exists scan_changes_identity_id_fkey;

drop index if exists resource_memberships_identity_idx;
drop index if exists resource_memberships_account_idx;
drop index if exists guest_activity_identity_idx;
drop index if exists risk_scores_identity_idx;
drop index if exists risk_findings_identity_idx;
drop index if exists review_items_identity_idx;
drop index if exists remediation_actions_identity_idx;
drop index if exists alerts_identity_idx;
drop index if exists scan_changes_identity_idx;

alter table if exists resource_memberships drop column if exists identity_id;
alter table if exists resource_memberships drop column if exists account_id;
alter table if exists guest_activity drop column if exists identity_id;
alter table if exists risk_scores drop column if exists identity_id;
alter table if exists risk_findings drop column if exists identity_id;
alter table if exists review_items drop column if exists identity_id;
alter table if exists remediation_actions drop column if exists identity_id;
alter table if exists alerts drop column if exists identity_id;
alter table if exists scan_changes drop column if exists identity_id;

COMMIT;
