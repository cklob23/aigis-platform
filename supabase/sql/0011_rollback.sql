-- AIGIS 0011 rollback. Drops identities.risk_factors.
-- Does not drop 0010 PIM objects.
--
-- Not part of the supabase migration chain. Owner-run only. Single
-- transaction: a failure leaves the catalog as it was.
-- After this file: run supabase/sql/0011_precheck.sql to confirm the
-- post-0010 shape is back.

BEGIN;

alter table if exists identities drop column if exists risk_factors;

COMMIT;
