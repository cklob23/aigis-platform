-- AIGIS 0006 rollback. Drops the owner_identity index and reverses the
-- sponsors backfill of identities.owner_identity_id.
-- Owner-run only. Single transaction. Idempotent.
-- Does not drop guest_id or identity_relations.

BEGIN;

update identities i
set owner_identity_id = null
from identity_relations r
where r.tenant_id = i.tenant_id
  and r.from_identity_id = i.id
  and r.to_identity_id = i.owner_identity_id
  and r.relation_type = 'sponsors';

drop index if exists identities_owner_identity_idx;

COMMIT;
