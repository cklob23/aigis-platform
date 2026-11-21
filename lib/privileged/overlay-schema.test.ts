import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR11_TEST_DB ?? 'aigis_pr11_test'
const TENANT = '00000000-0000-0000-0000-000000000010'
const HUB = '00000000-0000-0000-0000-000000000199'

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

function applyExpectFail(rel: string) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, '-f', path.join(root, rel)], {
    encoding: 'utf8',
  })
  return `${result.stderr}\n${result.stdout}`
}

function scalar(sql: string) {
  return psql(['-t', '-A', '-c', sql]).trim()
}

describe('0011 privileged risk overlay (local postgres)', () => {
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
    apply('supabase/migrations/0006_owner_identity.sql')
    apply('supabase/sql/0007_precheck.sql')
    apply('supabase/migrations/0007_recommendation_explanations.sql')
    apply('supabase/sql/0008_precheck.sql')
    apply('supabase/migrations/0008_identity_first_governance.sql')
    apply('supabase/sql/0008a_precheck.sql')
    apply('supabase/migrations/0008a_fix_provision_governance_ids.sql')
    psql([
      '-c',
      `insert into identities (id, tenant_id, identity_class, display_name)
       values ('${HUB}', '${TENANT}', 'human_internal', 'Adele Admin')`,
    ])
    apply('supabase/sql/0009_precheck.sql')
    apply('supabase/migrations/0009_privileged_roles.sql')
    apply('supabase/sql/0009_postcheck.sql')
    apply('supabase/sql/0010_precheck.sql')
    apply('supabase/migrations/0010_pim_eligibility.sql')
    apply('supabase/sql/0010_postcheck.sql')
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck, forward, postcheck: risk_factors jsonb default []', () => {
    apply('supabase/sql/0011_precheck.sql')
    apply('supabase/migrations/0011_privileged_risk_overlay.sql')
    const post = apply('supabase/sql/0011_postcheck.sql')
    expect(post).toMatch(/risk_factors_type/)
    expect(
      scalar(
        `select data_type from information_schema.columns where table_schema = 'public' and table_name = 'identities' and column_name = 'risk_factors'`,
      ),
    ).toBe('jsonb')
    expect(scalar(`select is_nullable from information_schema.columns where table_name = 'identities' and column_name = 'risk_factors'`)).toBe(
      'NO',
    )
    expect(scalar(`select risk_factors::text from identities where id = '${HUB}'`)).toBe('[]')
  })

  it('blocks a second apply and blocks 0010 rollback until 0011 is rolled back', () => {
    const blockedAgain = applyExpectFail('supabase/migrations/0011_privileged_risk_overlay.sql')
    expect(blockedAgain).toMatch(/already exists/)
    const blockedTen = applyExpectFail('supabase/sql/0010_rollback.sql')
    expect(blockedTen).toMatch(/roll back 0011 first/)
    apply('supabase/sql/0011_rollback.sql')
    expect(
      scalar(
        `select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'identities' and column_name = 'risk_factors'`,
      ),
    ).toBe('0')
    apply('supabase/sql/0011_precheck.sql')
    apply('supabase/migrations/0011_privileged_risk_overlay.sql')
    apply('supabase/sql/0011_postcheck.sql')
    expect(scalar(`select count(*) from pg_tables where schemaname = 'public' and tablename = 'group_pim_eligibilities'`)).toBe('1')
  })
})
