import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_0008A_TEST_DB ?? 'aigis_0008a_test'

const TENANT = '00000000-0000-0000-0000-000000000010'
const RESOURCE = '00000000-0000-0000-0000-000000000201'
const REVIEW = '00000000-0000-0000-0000-000000000701'
const GUEST = '00000000-0000-0000-0000-000000000102'
const IDENTITY = '00000000-0000-0000-0000-000000000102'

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

function insertExpectFail(sql: string) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, '-c', sql], { encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  return `${result.stderr}\n${result.stdout}`
}

describe('0008a provision_governance_ids nested table checks (local postgres)', () => {
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
    apply('supabase/sql/0008_postcheck.sql')
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('reproduces the risk_scores NEW.account_id error on the 0005 function body', () => {
    const err = insertExpectFail(
      `insert into risk_scores (id, tenant_id, guest_id, identity_id, score, level)
       values ('00000000-0000-0000-0000-0000000005a1', '${TENANT}', '${GUEST}', '${IDENTITY}', 12, 'low')`,
    )
    expect(err).toMatch(/has no field "account_id"/)
  })

  it('precheck, forward, postcheck nest the resource_memberships account_id read', () => {
    apply('supabase/sql/0008a_precheck.sql')
    apply('supabase/migrations/0008a_fix_provision_governance_ids.sql')
    apply('supabase/sql/0008a_postcheck.sql')
    expect(
      scalar(`select p.prosrc like '%if tg_table_name = ''resource_memberships'' then%'
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'provision_governance_ids'`),
    ).toBe('t')
  })

  it('inserts a guest-keyed risk_scores row and one row on each of the eight trigger tables', () => {
    psql([
      '-c',
      `insert into risk_scores (id, tenant_id, guest_id, identity_id, score, level)
       values ('00000000-0000-0000-0000-0000000005a2', '${TENANT}', '${GUEST}', '${IDENTITY}', 12, 'low')`,
    ])
    expect(scalar(`select identity_id from risk_scores where id = '00000000-0000-0000-0000-0000000005a2'`)).toBe(IDENTITY)

    psql([
      '-c',
      `insert into resource_memberships (id, tenant_id, guest_id, resource_id, membership_type)
       values ('00000000-0000-0000-0000-0000000003a2', '${TENANT}', '${GUEST}', '${RESOURCE}', 'member')`,
    ])
    expect(scalar(`select identity_id from resource_memberships where id = '00000000-0000-0000-0000-0000000003a2'`)).toBe(
      IDENTITY,
    )
    expect(scalar(`select account_id is not null from resource_memberships where id = '00000000-0000-0000-0000-0000000003a2'`)).toBe(
      't',
    )

    psql([
      '-c',
      `insert into guest_activity (id, tenant_id, guest_id, activity_type)
       values ('00000000-0000-0000-0000-0000000004a2', '${TENANT}', '${GUEST}', 'scanned')`,
    ])
    psql([
      '-c',
      `insert into risk_findings (id, tenant_id, guest_id, severity, finding_type, title)
       values ('00000000-0000-0000-0000-0000000006a2', '${TENANT}', '${GUEST}', 'low', 'no_sponsor', '0008a')`,
    ])
    psql([
      '-c',
      `insert into review_items (id, tenant_id, review_id, guest_id, status)
       values ('00000000-0000-0000-0000-0000000008a2', '${TENANT}', '${REVIEW}', '${GUEST}', 'pending')`,
    ])
    psql([
      '-c',
      `insert into remediation_actions (id, tenant_id, guest_id, action_type, status, reason)
       values ('00000000-0000-0000-0000-0000000009a2', '${TENANT}', '${GUEST}', 'disable_guest', 'pending', '0008a')`,
    ])
    psql([
      '-c',
      `insert into alerts (id, tenant_id, alert_type, severity, title, guest_id)
       values ('00000000-0000-0000-0000-000000000aa2', '${TENANT}', 'risk_level', 'low', '0008a', '${GUEST}')`,
    ])
    psql([
      '-c',
      `insert into scan_changes (id, tenant_id, change_type, guest_id)
       values ('00000000-0000-0000-0000-000000000ba2', '${TENANT}', 'new_guest', '${GUEST}')`,
    ])

    expect(scalar(`select identity_id from guest_activity where id = '00000000-0000-0000-0000-0000000004a2'`)).toBe(IDENTITY)
    expect(scalar(`select identity_id from risk_findings where id = '00000000-0000-0000-0000-0000000006a2'`)).toBe(IDENTITY)
    expect(scalar(`select identity_id from review_items where id = '00000000-0000-0000-0000-0000000008a2'`)).toBe(IDENTITY)
    expect(scalar(`select identity_id from remediation_actions where id = '00000000-0000-0000-0000-0000000009a2'`)).toBe(
      IDENTITY,
    )
    expect(scalar(`select identity_id from alerts where id = '00000000-0000-0000-0000-000000000aa2'`)).toBe(IDENTITY)
    expect(scalar(`select identity_id from scan_changes where id = '00000000-0000-0000-0000-000000000ba2'`)).toBe(IDENTITY)
  })

  it('rollback restores the 0005 body so risk_scores fails again, then 0008a re-applies', () => {
    apply('supabase/sql/0008a_rollback.sql')
    apply('supabase/sql/0008a_precheck.sql')
    const err = insertExpectFail(
      `insert into risk_scores (id, tenant_id, guest_id, identity_id, score, level)
       values ('00000000-0000-0000-0000-0000000005a3', '${TENANT}', '${GUEST}', '${IDENTITY}', 8, 'low')`,
    )
    expect(err).toMatch(/has no field "account_id"/)

    apply('supabase/sql/0008a_precheck.sql')
    apply('supabase/migrations/0008a_fix_provision_governance_ids.sql')
    apply('supabase/sql/0008a_postcheck.sql')
    psql([
      '-c',
      `insert into risk_scores (id, tenant_id, guest_id, identity_id, score, level)
       values ('00000000-0000-0000-0000-0000000005a3', '${TENANT}', '${GUEST}', '${IDENTITY}', 8, 'low')`,
    ])
    expect(scalar(`select score from risk_scores where id = '00000000-0000-0000-0000-0000000005a3'`)).toBe('8')
  })
})
