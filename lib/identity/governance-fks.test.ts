import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR3_TEST_DB ?? 'aigis_pr3_test'

function psql(args: string[], input?: string) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, ...args], {
    encoding: 'utf8',
    input,
  })
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

function recreateDb() {
  const drop = spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  if (drop.status !== 0) throw new Error(drop.stderr)
  const create = spawnSync('createdb', [DB], { encoding: 'utf8' })
  if (create.status !== 0) throw new Error(create.stderr)
}

describe('0005 governance FKs (local postgres)', () => {
  beforeAll(() => {
    recreateDb()
    apply('supabase/migrations/0001_init.sql')
    apply('supabase/migrations/0002_external_identity_governance.sql')
    apply('supabase/migrations/0003_alert_rules_and_review_workflow.sql')
    apply('supabase/sql/0004_fixture.sql')
    apply('supabase/migrations/0004_identity_graph.sql')
    apply('supabase/sql/0005_fixture.sql')
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck passes on post-0004 schema, then 0005 backfills both ids', () => {
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'identity_id'`),
    ).toBe('0')

    apply('supabase/sql/0005_precheck.sql')
    apply('supabase/migrations/0005_governance_fks.sql')
    const post = apply('supabase/sql/0005_postcheck.sql')

    expect(scalar(`select identity_id from review_items where id = '00000000-0000-0000-0000-000000000801'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id from resource_memberships where id = '00000000-0000-0000-0000-000000000301'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id from guest_activity where id = '00000000-0000-0000-0000-000000000401'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id from risk_scores where id = '00000000-0000-0000-0000-000000000501'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id from risk_findings where id = '00000000-0000-0000-0000-000000000601'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id from remediation_actions where id = '00000000-0000-0000-0000-000000000901'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id from alerts where id = '00000000-0000-0000-0000-000000000a01'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id is null from alerts where id = '00000000-0000-0000-0000-000000000a02'`)).toBe('t')
    expect(scalar(`select identity_id from scan_changes where id = '00000000-0000-0000-0000-000000000b01'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select identity_id is null from scan_changes where id = '00000000-0000-0000-0000-000000000b02'`)).toBe('t')
    expect(
      scalar(`select account_id is not null from resource_memberships where id = '00000000-0000-0000-0000-000000000301'`),
    ).toBe('t')
    expect(
      scalar(`select a.source from resource_memberships m join identity_accounts a on a.id = m.account_id
              where m.id = '00000000-0000-0000-0000-000000000301'`),
    ).toBe('entra')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'guest_id'`),
    ).toBe('1')
    expect(post).toMatch(/membership_count/)
  })

  it('trigger dual-fills omitted identity_id and account_id, and keeps tenant_id filters', () => {
    psql([
      '-c',
      `insert into resource_memberships (id, tenant_id, guest_id, resource_id, membership_type)
       values (
         '00000000-0000-0000-0000-000000000302',
         '00000000-0000-0000-0000-000000000010',
         '00000000-0000-0000-0000-000000000102',
         '00000000-0000-0000-0000-000000000201',
         'owner'
       )`,
    ])
    expect(scalar(`select identity_id from resource_memberships where id = '00000000-0000-0000-0000-000000000302'`)).toBe(
      '00000000-0000-0000-0000-000000000102',
    )
    expect(
      scalar(`select account_id is not null from resource_memberships where id = '00000000-0000-0000-0000-000000000302'`),
    ).toBe('t')

    psql([
      '-c',
      `insert into alerts (id, tenant_id, alert_type, severity, title)
       values (
         '00000000-0000-0000-0000-000000000a03',
         '00000000-0000-0000-0000-000000000010',
         'scan_failed',
         'low',
         'No guest'
       )`,
    ])
    expect(scalar(`select identity_id is null from alerts where id = '00000000-0000-0000-0000-000000000a03'`)).toBe('t')
    expect(
      scalar(`select count(*) from review_items where tenant_id = '00000000-0000-0000-0000-000000000010'`),
    ).toBe(scalar(`select count(*) from review_items`))
  })

  it('is idempotent, then rollback restores post-0004, then forward-again passes gates', () => {
    apply('supabase/migrations/0005_governance_fks.sql')
    apply('supabase/sql/0005_postcheck.sql')

    apply('supabase/sql/0005_rollback.sql')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'identity_id'`),
    ).toBe('0')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'resource_memberships' and column_name = 'account_id'`),
    ).toBe('0')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'guest_id'`),
    ).toBe('1')
    expect(scalar(`select count(*) from pg_proc where proname = 'provision_governance_ids'`)).toBe('0')
    expect(scalar('select count(*) from review_items')).toBe('1')
    apply('supabase/sql/0005_precheck.sql')

    apply('supabase/migrations/0005_governance_fks.sql')
    apply('supabase/sql/0005_postcheck.sql')
    expect(scalar(`select identity_id from review_items where id = '00000000-0000-0000-0000-000000000801'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(
      scalar(`select count(*) from resource_memberships where guest_id is not null and identity_id is null`),
    ).toBe('0')
    expect(
      scalar(`select count(*) from resource_memberships where guest_id is not null and account_id is null`),
    ).toBe('0')
  })
})
