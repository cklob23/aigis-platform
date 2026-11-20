import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TIER_0_TEMPLATE_IDS } from '@/lib/privileged/tiers'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DB = process.env.AIGIS_PR10_TEST_DB ?? 'aigis_pr10_test'
const TENANT = '00000000-0000-0000-0000-000000000010'
const HUB = '00000000-0000-0000-0000-000000000199'
const ROLE = '00000000-0000-0000-0000-000000000b11'
const ELIG = '00000000-0000-0000-0000-000000000c11'
const GRP = '00000000-0000-0000-0000-000000000d11'

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

describe('0010 PIM eligibility (local postgres)', () => {
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
  })

  afterAll(() => {
    spawnSync('dropdb', ['--if-exists', DB], { encoding: 'utf8' })
  })

  it('precheck, forward, postcheck: PIM columns, group table, RLS, FKs', () => {
    apply('supabase/sql/0010_precheck.sql')
    apply('supabase/migrations/0010_pim_eligibility.sql')
    const post = apply('supabase/sql/0010_postcheck.sql')
    expect(post).toMatch(/group_pim_eligibilities/)
    expect(
      scalar(
        `select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'group_pim_eligibilities'`,
      ),
    ).toBe('t')
    expect(scalar(`select count(*) from pg_policies where tablename = 'group_pim_eligibilities'`)).toBe('0')
    expect(
      scalar(
        `select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'role_assignments' and column_name in ('member_type', 'pim_status', 'starts_at', 'ends_at')`,
      ),
    ).toBe('4')
    expect(scalar(`select column_default from information_schema.columns where table_name = 'role_assignments' and column_name = 'member_type'`)).toMatch(
      /direct/,
    )
  })

  it('enforces eligible assignment fields, group PIM checks, and uniqueness', () => {
    psql([
      '-c',
      `insert into directory_roles (id, tenant_id, ms_role_id, template_id, display_name, is_built_in, ms_is_privileged, is_privileged, privilege_tier, tier_rule, tier_map_version)
       values (
         '${ROLE}',
         '${TENANT}',
         '${TIER_0_TEMPLATE_IDS['Privileged Role Administrator']}',
         '${TIER_0_TEMPLATE_IDS['Privileged Role Administrator']}',
         'Privileged Role Administrator',
         true,
         true,
         true,
         0,
         't0_fixed',
         '2026-11-20.1'
       )`,
    ])
    psql([
      '-c',
      `insert into role_assignments (id, tenant_id, ms_assignment_id, directory_role_id, principal_identity_id, principal_ms_object_id, assignment_type, member_type, pim_status, starts_at, ends_at)
       values (
         '${ELIG}',
         '${TENANT}',
         'elig-miriam-pra',
         '${ROLE}',
         '${HUB}',
         '11111111-1111-1111-1111-111111111112',
         'eligible',
         'direct',
         'Provisioned',
         '2026-01-01T00:00:00Z',
         null
       )`,
    ])
    expect(scalar(`select assignment_type from role_assignments where id = '${ELIG}'`)).toBe('eligible')
    expect(scalar(`select member_type from role_assignments where id = '${ELIG}'`)).toBe('direct')
    expect(
      insertExpectFail(
        `insert into role_assignments (tenant_id, ms_assignment_id, directory_role_id, principal_ms_object_id, member_type)
         values ('${TENANT}', 'elig-bad-member', '${ROLE}', '11111111-1111-1111-1111-111111111112', 'nested')`,
      ),
    ).toMatch(/role_assignments_member_type_chk/)
    psql([
      '-c',
      `insert into group_pim_eligibilities (id, tenant_id, ms_schedule_id, group_ms_object_id, principal_identity_id, principal_ms_object_id, access_id, member_type, pim_status, starts_at, ends_at)
       values (
         '${GRP}',
         '${TENANT}',
         'grp-elig-pat-secops',
         'demo-pim-group-secops',
         '${HUB}',
         '11111111-1111-1111-1111-111111111101',
         'member',
         'direct',
         'Provisioned',
         '2026-02-01T00:00:00Z',
         '2027-02-01T00:00:00Z'
       )`,
    ])
    expect(
      insertExpectFail(
        `insert into group_pim_eligibilities (tenant_id, ms_schedule_id, group_ms_object_id, principal_ms_object_id, access_id)
         values ('${TENANT}', 'grp-elig-pat-secops', 'g2', 'p2', 'member')`,
      ),
    ).toMatch(/group_pim_eligibilities_tenant_id_ms_schedule_id_key/)
    expect(
      insertExpectFail(
        `insert into group_pim_eligibilities (tenant_id, ms_schedule_id, group_ms_object_id, principal_ms_object_id, access_id)
         values ('${TENANT}', 'grp-bad-access', 'g2', 'p2', 'guest')`,
      ),
    ).toMatch(/group_pim_eligibilities_access_id_chk/)
    expect(
      insertExpectFail(
        `insert into group_pim_eligibilities (tenant_id, ms_schedule_id, group_ms_object_id, principal_ms_object_id, access_id, member_type)
         values ('${TENANT}', 'grp-bad-member', 'g2', 'p2', 'owner', 'nested')`,
      ),
    ).toMatch(/group_pim_eligibilities_member_type_chk/)
  })

  it('blocks 0009 rollback until 0010 is rolled back, then restores post-0009', () => {
    const blockedNine = applyExpectFail('supabase/sql/0009_rollback.sql')
    expect(blockedNine).toMatch(/roll back 0010 first/)
    const blockedAgain = applyExpectFail('supabase/migrations/0010_pim_eligibility.sql')
    expect(blockedAgain).toMatch(/already exists/)
    apply('supabase/sql/0010_rollback.sql')
    expect(scalar(`select count(*) from pg_tables where schemaname = 'public' and tablename = 'group_pim_eligibilities'`)).toBe('0')
    expect(
      scalar(
        `select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'role_assignments' and column_name = 'starts_at'`,
      ),
    ).toBe('0')
    expect(scalar(`select count(*) from pg_tables where schemaname = 'public' and tablename = 'role_assignments'`)).toBe('1')
    apply('supabase/sql/0010_precheck.sql')
    apply('supabase/migrations/0010_pim_eligibility.sql')
    apply('supabase/sql/0010_postcheck.sql')
  })
})
