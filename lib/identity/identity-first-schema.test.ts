import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR8_TEST_DB ?? 'aigis_pr8_test'

const TENANT = '00000000-0000-0000-0000-000000000010'
const RESOURCE = '00000000-0000-0000-0000-000000000201'
const REVIEW = '00000000-0000-0000-0000-000000000701'
const GUEST_IDENTITY = '00000000-0000-0000-0000-000000000101'
const HUB_ONLY = '00000000-0000-0000-0000-000000000199'
const ASSIGNMENT = '00000000-0000-0000-0000-000000000aaa'

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

function applyExpectFail(rel: string) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, '-f', path.join(root, rel)], {
    encoding: 'utf8',
  })
  return `${result.stderr}\n${result.stdout}`
}

function scalar(sql: string) {
  return psql(['-t', '-A', '-c', sql]).trim()
}

function insertExpectFail(sql: string) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, '-c', sql], { encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  return `${result.stderr}\n${result.stdout}`
}

function recreateDb() {
  const drop = spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  if (drop.status !== 0) throw new Error(drop.stderr)
  const create = spawnSync('createdb', [DB], { encoding: 'utf8' })
  if (create.status !== 0) throw new Error(create.stderr)
}

function counts() {
  return {
    resource_memberships: scalar('select count(*) from resource_memberships'),
    guest_activity: scalar('select count(*) from guest_activity'),
    risk_scores: scalar('select count(*) from risk_scores'),
    review_items: scalar('select count(*) from review_items'),
  }
}

describe('0008 identity-first governance (local postgres)', () => {
  beforeAll(() => {
    recreateDb()
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
    psql([
      '-c',
      `insert into identities (id, tenant_id, identity_class, display_name)
       values ('${HUB_ONLY}', '${TENANT}', 'privileged', 'Pilot privileged')`,
    ])
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck, forward, postcheck: nullable guest_id, checks, indexes, triggers', () => {
    const before = counts()
    apply('supabase/sql/0008_precheck.sql')
    apply('supabase/migrations/0008_identity_first_governance.sql')
    const post = apply('supabase/sql/0008_postcheck.sql')
    const after = counts()
    expect(after).toEqual(before)
    expect(post).toMatch(/resource_memberships/)

    for (const table of ['resource_memberships', 'guest_activity', 'risk_scores', 'review_items']) {
      expect(
        scalar(`select is_nullable from information_schema.columns
                where table_schema = 'public' and table_name = '${table}' and column_name = 'guest_id'`),
      ).toBe('YES')
    }
    expect(scalar(`select convalidated from pg_constraint where conname = 'review_items_subject_present_chk'`)).toBe('t')
    expect(scalar(`select count(*) from review_items where subject_kind is distinct from 'identity'`)).toBe('0')
    expect(scalar(`select count(*) from review_items where role_assignment_id is not null`)).toBe('0')
    expect(
      scalar(`select indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid
              where c.relname = 'review_items_review_identity_uidx'`),
    ).toBe('t')
    expect(
      scalar(`select count(*) from pg_trigger where not tgisinternal and tgname like '%_provision_governance_ids'`),
    ).toBe('8')
    expect(scalar('select count(*) from identities_legacy_view')).toBe(scalar('select count(*) from guest_identities'))
  })

  it('allows identity-only inserts on all four tables and rejects both-null', () => {
    psql([
      '-c',
      `insert into resource_memberships (id, tenant_id, guest_id, identity_id, resource_id, membership_type)
       values ('00000000-0000-0000-0000-000000000391', '${TENANT}', null, '${HUB_ONLY}', '${RESOURCE}', 'member')`,
    ])
    psql([
      '-c',
      `insert into guest_activity (id, tenant_id, guest_id, identity_id, activity_type)
       values ('00000000-0000-0000-0000-000000000491', '${TENANT}', null, '${HUB_ONLY}', 'scanned')`,
    ])
    psql([
      '-c',
      `insert into risk_scores (id, tenant_id, guest_id, identity_id, score, level)
       values ('00000000-0000-0000-0000-000000000591', '${TENANT}', null, '${HUB_ONLY}', 12, 'low')`,
    ])
    psql([
      '-c',
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, status)
       values ('00000000-0000-0000-0000-000000000891', '${TENANT}', '${REVIEW}', null, '${HUB_ONLY}', 'pending')`,
    ])
    expect(scalar(`select guest_id is null from resource_memberships where id = '00000000-0000-0000-0000-000000000391'`)).toBe(
      't',
    )
    expect(scalar(`select identity_id from review_items where id = '00000000-0000-0000-0000-000000000891'`)).toBe(HUB_ONLY)
    expect(scalar(`select subject_kind from review_items where id = '00000000-0000-0000-0000-000000000891'`)).toBe('identity')

    expect(insertExpectFail(
      `insert into resource_memberships (id, tenant_id, guest_id, identity_id, resource_id)
       values ('00000000-0000-0000-0000-000000000392', '${TENANT}', null, null, '${RESOURCE}')`,
    )).toMatch(/subject_present/)
    expect(insertExpectFail(
      `insert into guest_activity (id, tenant_id, guest_id, identity_id, activity_type)
       values ('00000000-0000-0000-0000-000000000492', '${TENANT}', null, null, 'scanned')`,
    )).toMatch(/subject_present/)
    expect(insertExpectFail(
      `insert into risk_scores (id, tenant_id, guest_id, identity_id, score, level)
       values ('00000000-0000-0000-0000-000000000592', '${TENANT}', null, null, 1, 'low')`,
    )).toMatch(/subject_present/)
    expect(insertExpectFail(
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id)
       values ('00000000-0000-0000-0000-000000000892', '${TENANT}', '${REVIEW}', null, null)`,
    )).toMatch(/subject_present/)
  })

  it('requires role_assignment_id and identity_id when subject_kind is role_assignment', () => {
    expect(insertExpectFail(
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind)
       values ('00000000-0000-0000-0000-000000000893', '${TENANT}', '${REVIEW}', null, '${HUB_ONLY}', 'role_assignment')`,
    )).toMatch(/role_assignment_subject/)
    expect(insertExpectFail(
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind, role_assignment_id)
       values ('00000000-0000-0000-0000-000000000894', '${TENANT}', '${REVIEW}', null, null, 'role_assignment', '${ASSIGNMENT}')`,
    )).toMatch(/role_assignment_subject|subject_present/)
    psql([
      '-c',
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind, role_assignment_id)
       values ('00000000-0000-0000-0000-000000000895', '${TENANT}', '${REVIEW}', null, '${HUB_ONLY}', 'role_assignment', '${ASSIGNMENT}')`,
    ])
    expect(scalar(`select subject_kind from review_items where id = '00000000-0000-0000-0000-000000000895'`)).toBe(
      'role_assignment',
    )
  })

  it('enforces the partial unique indexes', () => {
    expect(insertExpectFail(
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind)
       values ('00000000-0000-0000-0000-000000000896', '${TENANT}', '${REVIEW}', null, '${GUEST_IDENTITY}', 'identity')`,
    )).toMatch(/review_items_review_identity_uidx/)
    expect(insertExpectFail(
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind, role_assignment_id)
       values ('00000000-0000-0000-0000-000000000897', '${TENANT}', '${REVIEW}', null, '${HUB_ONLY}', 'role_assignment', '${ASSIGNMENT}')`,
    )).toMatch(/review_items_review_assignment_uidx/)
  })

  it('rollback gate blocks while identity-only rows exist, then succeeds after delete', () => {
    const blocked = applyExpectFail('supabase/sql/0008_rollback.sql')
    expect(blocked).toMatch(/roll back 0009\+ and delete non-guest rows first/)
    expect(
      scalar(`select is_nullable from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'guest_id'`),
    ).toBe('YES')

    psql([
      '-c',
      `delete from resource_memberships where guest_id is null;
       delete from guest_activity where guest_id is null;
       delete from risk_scores where guest_id is null;
       delete from review_items where guest_id is null;`,
    ])
    apply('supabase/sql/0008_rollback.sql')
    expect(
      scalar(`select is_nullable from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'guest_id'`),
    ).toBe('NO')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'subject_kind'`),
    ).toBe('0')
    apply('supabase/sql/0008_precheck.sql')
    apply('supabase/migrations/0008_identity_first_governance.sql')
    apply('supabase/sql/0008_postcheck.sql')
    expect(
      scalar(`select is_nullable from information_schema.columns
              where table_schema = 'public' and table_name = 'risk_scores' and column_name = 'guest_id'`),
    ).toBe('YES')
  })
})
