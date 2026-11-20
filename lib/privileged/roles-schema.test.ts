import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TIER_0_TEMPLATE_IDS } from '@/lib/privileged/tiers'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR9_TEST_DB ?? 'aigis_pr9_test'
const TENANT = '00000000-0000-0000-0000-000000000010'
const HUB = '00000000-0000-0000-0000-000000000199'
const REVIEW = '00000000-0000-0000-0000-000000000701'

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

function insertExpectFail(sql: string) {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-X', '-d', DB, '-c', sql], { encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  return `${result.stderr}\n${result.stdout}`
}

describe('0009 privileged roles (local postgres)', () => {
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
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck, forward, postcheck: RLS, FKs, uniques, identity flags', () => {
    apply('supabase/sql/0009_precheck.sql')
    apply('supabase/migrations/0009_privileged_roles.sql')
    const post = apply('supabase/sql/0009_postcheck.sql')
    expect(post).toMatch(/directory_roles/)
    expect(scalar(`select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'directory_roles'`)).toBe('t')
    expect(scalar(`select count(*) from pg_policies where tablename in ('directory_roles', 'role_assignments')`)).toBe('0')
    expect(scalar(`select is_privileged from identities where id = '${HUB}'`)).toBe('f')
    expect(scalar(`select privilege_tier is null from identities where id = '${HUB}'`)).toBe('t')
  })

  it('enforces privilege flags, uniques, and the review_items assignment FK', () => {
    psql([
      '-c',
      `insert into directory_roles (id, tenant_id, ms_role_id, template_id, display_name, is_built_in, ms_is_privileged, is_privileged, privilege_tier, tier_rule, tier_map_version)
       values (
         '00000000-0000-0000-0000-000000000b01',
         '${TENANT}',
         '${TIER_0_TEMPLATE_IDS['Global Administrator']}',
         '${TIER_0_TEMPLATE_IDS['Global Administrator']}',
         'Global Administrator',
         true,
         true,
         true,
         0,
         't0_fixed',
         '2026-11-20.1'
       )`,
    ])
    expect(insertExpectFail(
      `insert into directory_roles (tenant_id, ms_role_id, display_name, is_privileged, privilege_tier, tier_rule, tier_map_version)
       values ('${TENANT}', '${TIER_0_TEMPLATE_IDS['Global Administrator']}', 'Global Administrator', true, 0, 't0_fixed', '2026-11-20.1')`,
    )).toMatch(/directory_roles_tenant_id_ms_role_id_key/)
    expect(insertExpectFail(
      `insert into directory_roles (tenant_id, ms_role_id, display_name, is_privileged, privilege_tier, tier_rule, tier_map_version)
       values ('${TENANT}', 'role-excluded', 'Directory Readers', true, 0, 'excluded', '2026-11-20.1')`,
    )).toMatch(/directory_roles_privilege_flags_chk/)
    psql([
      '-c',
      `insert into role_assignments (id, tenant_id, ms_assignment_id, directory_role_id, principal_identity_id, principal_ms_object_id)
       values (
         '00000000-0000-0000-0000-000000000c01',
         '${TENANT}',
         'asg-adele-ga',
         '00000000-0000-0000-0000-000000000b01',
         '${HUB}',
         '11111111-1111-1111-1111-111111111102'
       )`,
    ])
    psql([
      '-c',
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind, role_assignment_id)
       values (
         '00000000-0000-0000-0000-000000000d01',
         '${TENANT}',
         '${REVIEW}',
         null,
         '${HUB}',
         'role_assignment',
         '00000000-0000-0000-0000-000000000c01'
       )`,
    ])
    expect(insertExpectFail(
      `insert into review_items (id, tenant_id, review_id, guest_id, identity_id, subject_kind, role_assignment_id)
       values (
         '00000000-0000-0000-0000-000000000d02',
         '${TENANT}',
         '${REVIEW}',
         null,
         '${HUB}',
         'role_assignment',
         '00000000-0000-0000-0000-000000000c99'
       )`,
    )).toMatch(/review_items_role_assignment_id_fkey/)
    expect(insertExpectFail(
      `update identities set is_privileged = true, privilege_tier = null where id = '${HUB}'`,
    )).toMatch(/identities_privilege_flags_chk/)
  })

  it('rollback gate blocks while assignment FKs exist, then restores post-0008', () => {
    const blocked = applyExpectFail('supabase/sql/0009_rollback.sql')
    expect(blocked).toMatch(/review_items.role_assignment_id set/)
    psql(['-c', `delete from review_items where role_assignment_id is not null`])
    apply('supabase/sql/0009_rollback.sql')
    expect(scalar(`select count(*) from pg_tables where schemaname = 'public' and tablename = 'directory_roles'`)).toBe('0')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'identities' and column_name = 'is_privileged'`),
    ).toBe('0')
    expect(
      scalar(`select count(*) from information_schema.columns
              where table_schema = 'public' and table_name = 'review_items' and column_name = 'role_assignment_id'`),
    ).toBe('1')
    apply('supabase/sql/0009_precheck.sql')
    apply('supabase/migrations/0009_privileged_roles.sql')
    apply('supabase/sql/0009_postcheck.sql')
  })
})
