import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR1_TEST_DB ?? 'aigis_pr1_test'

const LEGACY_COLUMNS = [
  'id',
  'tenant_id',
  'identity_class',
  'identity_subtype',
  'ms_object_id',
  'display_name',
  'email',
  'upn',
  'entra_user_type',
  'account_enabled',
  'external_organization_id',
  'owner_ms_object_id',
  'owner_display_name',
  'last_activity_at',
  'risk_score',
  'risk_level',
  'review_status',
  'last_reviewed_at',
  'first_seen_at',
  'last_seen_at',
  'removed_at',
]

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

describe('0004 identity graph (local postgres)', () => {
  beforeAll(() => {
    recreateDb()
    apply('supabase/migrations/0001_init.sql')
    apply('supabase/migrations/0002_external_identity_governance.sql')
    apply('supabase/migrations/0003_alert_rules_and_review_workflow.sql')
    apply('supabase/sql/0004_fixture.sql')
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck passes on the 0002 identities view, then 0004 backfills 1:1', () => {
    const beforeCols = scalar(
      `select string_agg(column_name, ',' order by ordinal_position)
       from information_schema.columns
       where table_schema = 'public' and table_name = 'identities'`,
    )
    expect(beforeCols.split(',')).toEqual(LEGACY_COLUMNS)
    expect(scalar(`select relkind from pg_class where relname = 'identities'`)).toBe('v')

    apply('supabase/sql/0004_precheck.sql')
    apply('supabase/migrations/0004_identity_graph.sql')
    const post = apply('supabase/sql/0004_postcheck.sql')

    expect(scalar('select count(*) from guest_identities')).toBe('3')
    expect(scalar('select count(*) from identities')).toBe('3')
    expect(scalar('select count(*) from identity_accounts')).toBe('3')
    expect(scalar('select count(*) from guest_identities where identity_id is null')).toBe('0')
    expect(scalar(`select count(*) from identities where identity_class = 'human_internal'`)).toBe('0')
    expect(scalar('select count(*) from identity_relations')).toBe('0')
    expect(scalar(`select owner_kind from identities where id = '00000000-0000-0000-0000-000000000101'`)).toBe('sponsor')
    expect(scalar(`select owner_identity_id is null from identities where id = '00000000-0000-0000-0000-000000000101'`)).toBe('t')
    expect(scalar(`select owner_kind from identities where id = '00000000-0000-0000-0000-000000000102'`)).toBe('none')
    expect(scalar(`select identity_id from guest_identities where ms_object_id = 'oid-1'`)).toBe('00000000-0000-0000-0000-000000000101')
    expect(scalar(`select source || ':' || source_object_id from identity_accounts where identity_id = '00000000-0000-0000-0000-000000000101'`)).toBe('entra:oid-1')

    const afterCols = scalar(
      `select string_agg(column_name, ',' order by ordinal_position)
       from information_schema.columns
       where table_schema = 'public' and table_name = 'identities_legacy_view'`,
    )
    expect(afterCols).toBe(beforeCols)
    expect(scalar(`select relkind from pg_class where relname = 'identities'`)).toBe('r')
    expect(post).toMatch(/guest_count/)
  })

  it('rejects duplicate account keys and denies anon reads via RLS', () => {
    expect(() =>
      psql([
        '-c',
        `insert into identity_accounts (identity_id, tenant_id, source, source_object_id)
         values ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', 'entra', 'oid-1')`,
      ]),
    ).toThrow(/duplicate|unique/i)

    psql([
      '-c',
      `do $role$
       begin
         if not exists (select 1 from pg_roles where rolname = 'aigis_anon_test') then
           create role aigis_anon_test nologin;
         end if;
       end
       $role$;
       grant usage on schema public to aigis_anon_test;
       grant select on all tables in schema public to aigis_anon_test;
       grant select on identities_legacy_view to aigis_anon_test;`,
    ])
    const anonCount = scalar(`
        set role aigis_anon_test;
        select count(*) from identities;
        reset role;
      `)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && line !== 'SET' && line !== 'RESET')
    expect(anonCount).toEqual(['0'])
  })

  it('provisions hub and account when a guest is inserted without identity_id', () => {
    psql([
      '-c',
      `insert into guest_identities (tenant_id, ms_object_id, display_name, user_type, identity_class)
       values ('00000000-0000-0000-0000-000000000010', 'oid-trigger', 'Trigger Guest', 'Guest', 'external')`,
    ])
    expect(scalar('select count(*) from guest_identities')).toBe('4')
    expect(scalar('select count(*) from identities')).toBe('4')
    expect(scalar('select count(*) from identity_accounts')).toBe('4')
    expect(scalar(`select count(*) from guest_identities where identity_id is null`)).toBe('0')
    expect(scalar(`select count(*) from identity_accounts where source_object_id = 'oid-trigger'`)).toBe('1')
  })

  it('is idempotent, then rollback restores the view, then forward-again passes gates', () => {
    apply('supabase/migrations/0004_identity_graph.sql')
    apply('supabase/sql/0004_postcheck.sql')
    expect(scalar('select count(*) from identities')).toBe(scalar('select count(*) from guest_identities'))

    apply('supabase/sql/0004_rollback.sql')
    expect(scalar(`select relkind from pg_class where relname = 'identities'`)).toBe('v')
    expect(scalar(`select to_regclass('public.identity_accounts') is null`)).toBe('t')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'guest_identities' and column_name = 'identity_id'`),
    ).toBe('0')
    apply('supabase/sql/0004_precheck.sql')

    apply('supabase/migrations/0004_identity_graph.sql')
    apply('supabase/sql/0004_postcheck.sql')
    expect(scalar('select count(*) from guest_identities')).toBe(scalar('select count(*) from identities'))
    expect(scalar('select count(*) from identity_accounts')).toBe(scalar('select count(*) from guest_identities'))
    expect(scalar('select count(*) from guest_identities where identity_id is null')).toBe('0')
    expect(scalar(`select relkind from pg_class where relname = 'identities'`)).toBe('r')
    expect(scalar(`select count(*) from pg_views where viewname = 'identities_legacy_view'`)).toBe('1')
  })
})
