import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planGuestInventory, type IncomingExternalGuest } from '@/lib/identity/ingest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR2_TEST_DB ?? 'aigis_pr2_test'
const tenantId = '00000000-0000-0000-0000-000000000010'
const now = '2026-11-18T12:00:00.000Z'

function psql(args: string[]) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`psql ${args.join(' ')} failed:\n${result.stderr}\n${result.stdout}`)
  }
  return result.stdout
}

function apply(rel: string) {
  return psql(['-f', path.join(root, rel)])
}

function scalar(sql: string) {
  return psql(['-t', '-A', '-c', sql]).trim()
}

function lit(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  return `'${String(value).replace(/'/g, "''")}'`
}

function incoming(partial: Partial<IncomingExternalGuest> & Pick<IncomingExternalGuest, 'ms_object_id'>): IncomingExternalGuest {
  return {
    display_name: 'Guest',
    email: `${partial.ms_object_id}@ex.example`,
    upn: `${partial.ms_object_id}#EXT#`,
    domain: 'ex.example',
    external_domain_id: null,
    external_organization_id: null,
    external_type: 'b2b_guest',
    classification_evidence: [],
    company_name: null,
    company_source: null,
    account_enabled: true,
    invitation_status: 'Accepted',
    user_type: 'Guest',
    created_at_ms: null,
    last_sign_in_at: null,
    last_non_interactive_sign_in_at: null,
    sponsor_ms_object_id: null,
    sponsor_display_name: null,
    sponsor_email: null,
    sponsor_enabled: null,
    ...partial,
    ms_object_id: partial.ms_object_id,
    identity_class: 'external',
  }
}

describe('dual-write ingest against local postgres', () => {
  beforeAll(() => {
    const drop = spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
    if (drop.status !== 0) throw new Error(drop.stderr)
    const create = spawnSync('createdb', [DB], { encoding: 'utf8' })
    if (create.status !== 0) throw new Error(create.stderr)
    apply('supabase/migrations/0001_init.sql')
    apply('supabase/migrations/0002_external_identity_governance.sql')
    apply('supabase/migrations/0003_alert_rules_and_review_workflow.sql')
    apply('supabase/sql/0004_fixture.sql')
    apply('supabase/migrations/0004_identity_graph.sql')
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('upserts hub+account+guest, writes resolvable sponsor relations, and soft-removes missing guests', () => {
    expect(scalar('select count(*) from guest_identities')).toBe('3')
    expect(scalar('select count(*) from identities')).toBe('3')

    const plan = planGuestInventory({
      tenantId,
      now,
      incoming: [
        incoming({
          ms_object_id: 'oid-1',
          display_name: 'Guest One',
          email: 'one@partner.example',
          sponsor_ms_object_id: 'sponsor-oid',
          sponsor_email: 'pat@contoso.example',
        }),
        incoming({
          ms_object_id: 'oid-4',
          display_name: 'Guest Four',
          email: 'four@ex.example',
          sponsor_ms_object_id: 'oid-1',
          sponsor_email: 'one@partner.example',
          sponsor_display_name: 'Guest One',
        }),
      ],
      existing: [
        { id: '00000000-0000-0000-0000-000000000101', ms_object_id: 'oid-1', identity_id: '00000000-0000-0000-0000-000000000101', removed_at: null },
        { id: '00000000-0000-0000-0000-000000000102', ms_object_id: 'oid-2', identity_id: '00000000-0000-0000-0000-000000000102', removed_at: null },
        {
          id: '00000000-0000-0000-0000-000000000103',
          ms_object_id: 'oid-3',
          identity_id: '00000000-0000-0000-0000-000000000103',
          removed_at: scalar(`select removed_at::text from guest_identities where ms_object_id = 'oid-3'`),
        },
      ],
      generateId: () => '00000000-0000-0000-0000-000000000104',
    })

    expect(plan.newCount).toBe(1)
    expect(plan.removedGuestIds).toEqual(['00000000-0000-0000-0000-000000000102'])
    expect(plan.relations).toHaveLength(1)
    expect(plan.relations[0].from_identity_id).toBe('00000000-0000-0000-0000-000000000104')
    expect(plan.relations[0].to_identity_id).toBe('00000000-0000-0000-0000-000000000101')
    expect(plan.identities.every((row) => !('first_seen_at' in row) && !('risk_score' in row))).toBe(true)

    psql([
      '-c',
      `update identities
       set first_seen_at = '2020-01-01T00:00:00Z', risk_score = 42, risk_level = 'high', recommended_action = 'review', review_status = 'pending'
       where id = '00000000-0000-0000-0000-000000000101'`,
    ])

    for (const identity of plan.identities) {
      psql([
        '-c',
        `insert into identities (id, tenant_id, identity_class, display_name, primary_email, status, owner_kind, owner_email, owner_ms_object_id, owner_display_name, last_activity_at, last_seen_at, removed_at)
         values (${lit(identity.id)}, ${lit(identity.tenant_id)}, ${lit(identity.identity_class)}, ${lit(identity.display_name)}, ${lit(identity.primary_email)}, ${lit(identity.status)}, ${lit(identity.owner_kind)}, ${lit(identity.owner_email)}, ${lit(identity.owner_ms_object_id)}, ${lit(identity.owner_display_name)}, ${lit(identity.last_activity_at)}, ${lit(identity.last_seen_at)}, ${lit(identity.removed_at)})
         on conflict (id) do update set
           display_name = excluded.display_name,
           primary_email = excluded.primary_email,
           status = excluded.status,
           owner_kind = excluded.owner_kind,
           owner_email = excluded.owner_email,
           owner_ms_object_id = excluded.owner_ms_object_id,
           last_seen_at = excluded.last_seen_at,
           removed_at = excluded.removed_at`,
      ])
    }
    for (const account of plan.accounts) {
      psql([
        '-c',
        `insert into identity_accounts (identity_id, tenant_id, source, source_object_id, account_kind, upn, enabled, last_activity_at, last_seen_at, removed_at)
         values (${lit(account.identity_id)}, ${lit(account.tenant_id)}, ${lit(account.source)}, ${lit(account.source_object_id)}, ${lit(account.account_kind)}, ${lit(account.upn)}, ${lit(account.enabled)}, ${lit(account.last_activity_at)}, ${lit(account.last_seen_at)}, ${lit(account.removed_at)})
         on conflict (tenant_id, source, source_object_id) do update set
           identity_id = excluded.identity_id,
           upn = excluded.upn,
           enabled = excluded.enabled,
           last_seen_at = excluded.last_seen_at,
           removed_at = excluded.removed_at`,
      ])
    }
    for (const guest of plan.guests) {
      psql([
        '-c',
        `insert into guest_identities (id, tenant_id, identity_id, ms_object_id, display_name, email, upn, user_type, identity_class, account_enabled, last_seen_at, removed_at)
         values (${lit(guest.id)}, ${lit(guest.tenant_id)}, ${lit(guest.identity_id)}, ${lit(guest.ms_object_id)}, ${lit(guest.display_name)}, ${lit(guest.email)}, ${lit(guest.upn)}, ${lit(guest.user_type)}, ${lit(guest.identity_class)}, ${lit(guest.account_enabled)}, ${lit(guest.last_seen_at)}, ${lit(guest.removed_at)})
         on conflict (tenant_id, ms_object_id) do update set
           identity_id = excluded.identity_id,
           display_name = excluded.display_name,
           last_seen_at = excluded.last_seen_at,
           removed_at = excluded.removed_at`,
      ])
    }
    if (plan.removedGuestIds.length) {
      psql(['-c', `update guest_identities set removed_at = ${lit(now)} where id in (${plan.removedGuestIds.map(lit).join(',')})`])
      psql(['-c', `update identities set removed_at = ${lit(now)}, status = 'removed' where id in (${plan.removedIdentityIds.map(lit).join(',')})`])
      psql(['-c', `update identity_accounts set removed_at = ${lit(now)} where identity_id in (${plan.removedIdentityIds.map(lit).join(',')})`])
    }
    for (const rel of plan.relations) {
      psql([
        '-c',
        `insert into identity_relations (tenant_id, from_identity_id, to_identity_id, relation_type)
         values (${lit(rel.tenant_id)}, ${lit(rel.from_identity_id)}, ${lit(rel.to_identity_id)}, ${lit(rel.relation_type)})
         on conflict (tenant_id, from_identity_id, to_identity_id, relation_type) do nothing`,
      ])
    }

    expect(scalar('select count(*) from guest_identities')).toBe('4')
    expect(scalar('select count(*) from identities')).toBe('4')
    expect(scalar('select count(*) from identity_accounts')).toBe('4')
    expect(scalar('select count(*) from guest_identities where identity_id is null')).toBe('0')
    expect(scalar(`select count(*) from guest_identities where removed_at is null`)).toBe('2')
    expect(scalar(`select count(*) from guest_identities where ms_object_id = 'oid-2' and removed_at is not null`)).toBe('1')
    expect(scalar(`select identity_id from guest_identities where ms_object_id = 'oid-4'`)).toBe('00000000-0000-0000-0000-000000000104')
    expect(scalar(`select count(*) from identity_relations where relation_type = 'sponsors'`)).toBe('1')
    expect(scalar(`select count(*) from identities where identity_class = 'human_internal'`)).toBe('0')
    expect(scalar(`select first_seen_at = timestamptz '2020-01-01T00:00:00Z' from identities where id = '00000000-0000-0000-0000-000000000101'`)).toBe('t')
    expect(scalar(`select risk_score from identities where id = '00000000-0000-0000-0000-000000000101'`)).toBe('42')
    expect(scalar(`select risk_level from identities where id = '00000000-0000-0000-0000-000000000101'`)).toBe('high')
    expect(scalar(`select count(*) from guest_identities where removed_at is null`)).toBe(
      scalar(`select count(*) from identities where removed_at is null`),
    )
  })
})
