-- AIGIS 0007 rollback. Drops recommendation_explanations.
-- Owner-run only. Single transaction. Idempotent.
-- Does not drop guest_id on other tables or change identities.

BEGIN;

drop table if exists recommendation_explanations;

COMMIT;
