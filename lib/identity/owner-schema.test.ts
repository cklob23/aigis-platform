import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR4_TEST_DB ?? 'aigis_pr4_test'

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

describe('0006 owner identity (local postgres)', () => {
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
    apply('supabase/sql/0005_fixture.sql')
    apply('supabase/migrations/0005_governance_fks.sql')
    psql([
      '-c',
      `insert into identity_relations (tenant_id, from_identity_id, to_identity_id, relation_type)
       values (
         '00000000-0000-0000-0000-000000000010',
         '00000000-0000-0000-0000-000000000102',
         '00000000-0000-0000-0000-000000000101',
         'sponsors'
       )`,
    ])
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck, forward, postcheck backfills owner_identity_id from sponsors relations', () => {
    apply('supabase/sql/0006_precheck.sql')
    apply('supabase/migrations/0006_owner_identity.sql')
    apply('supabase/sql/0006_postcheck.sql')
    expect(scalar(`select owner_identity_id from identities where id = '00000000-0000-0000-0000-000000000102'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
    expect(scalar(`select owner_identity_id is null from identities where id = '00000000-0000-0000-0000-000000000101'`)).toBe('t')
    expect(scalar(`select count(*) from identities where identity_class = 'human_internal'`)).toBe('0')
  })

  it('is idempotent, then rollback restores post-0005, then forward-again passes gates', () => {
    apply('supabase/migrations/0006_owner_identity.sql')
    apply('supabase/sql/0006_postcheck.sql')
    apply('supabase/sql/0006_rollback.sql')
    expect(
      scalar(`select count(*) from pg_indexes where schemaname = 'public' and indexname = 'identities_owner_identity_idx'`),
    ).toBe('0')
    expect(scalar(`select owner_identity_id is null from identities where id = '00000000-0000-0000-0000-000000000102'`)).toBe('t')
    apply('supabase/sql/0006_precheck.sql')
    apply('supabase/migrations/0006_owner_identity.sql')
    apply('supabase/sql/0006_postcheck.sql')
    expect(scalar(`select owner_identity_id from identities where id = '00000000-0000-0000-0000-000000000102'`)).toBe(
      '00000000-0000-0000-0000-000000000101',
    )
  })
})
