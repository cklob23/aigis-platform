import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR7_TEST_DB ?? 'aigis_pr7_test'

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

describe('0007 recommendation explanations (local postgres)', () => {
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
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck, forward, postcheck creates deny-all explanation table', () => {
    apply('supabase/sql/0007_precheck.sql')
    apply('supabase/migrations/0007_recommendation_explanations.sql')
    apply('supabase/sql/0007_postcheck.sql')
    expect(scalar(`select to_regclass('public.recommendation_explanations') is not null`)).toBe('t')
    expect(
      scalar(`
        select c.relrowsecurity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'recommendation_explanations'
      `),
    ).toBe('t')
    expect(scalar(`select count(*) from pg_policies where tablename = 'recommendation_explanations'`)).toBe('0')
    expect(
      scalar(`
        select count(*) from pg_indexes
        where schemaname = 'public'
          and indexname in ('recommendation_explanations_identity_idx', 'recommendation_explanations_guest_idx')
      `),
    ).toBe('2')
  })

  it('is idempotent, then rollback drops the table, then forward-again passes gates', () => {
    apply('supabase/migrations/0007_recommendation_explanations.sql')
    apply('supabase/sql/0007_postcheck.sql')
    apply('supabase/sql/0007_rollback.sql')
    expect(scalar(`select to_regclass('public.recommendation_explanations') is null`)).toBe('t')
    apply('supabase/sql/0007_precheck.sql')
    apply('supabase/migrations/0007_recommendation_explanations.sql')
    apply('supabase/sql/0007_postcheck.sql')
    expect(scalar(`select to_regclass('public.recommendation_explanations') is not null`)).toBe('t')
  })
})
