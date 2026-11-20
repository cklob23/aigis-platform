import { describe, expect, it } from 'vitest'
import { CONTOSO_INTERNAL_USERS } from '@/lib/demo/internal-users'
import {
  DEMO_GROUP_PIM_ELIGIBILITIES,
  DEMO_PIM_ELIGIBILITIES,
  DEMO_ROLE_ASSIGNMENTS,
  DEMO_ROLE_DEFINITIONS,
} from '@/lib/demo/privileged-roles'
import { mapPimMemberType, planPrivilegedInventory, scheduleBounds } from '@/lib/privileged/ingest'
import { HELPDESK_ADMINISTRATOR_TEMPLATE_ID, TIER_0_TEMPLATE_IDS, TIER_MAP_VERSION } from '@/lib/privileged/tiers'

const tenantId = '00000000-0000-0000-0000-000000000010'
const now = '2026-11-20T00:00:00.000Z'
const adele = CONTOSO_INTERNAL_USERS[1]!
const megan = CONTOSO_INTERNAL_USERS[2]!
const pat = CONTOSO_INTERNAL_USERS[0]!
const alex = CONTOSO_INTERNAL_USERS[3]!

const ids = {
  adele: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  megan: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  pat: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  alex: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  allan: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
  joni: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
  miriam: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7',
}

describe('planPrivilegedInventory', () => {
  it('tiers mock 02/03/07 fixtures and sets identity privilege from the highest role', () => {
    const principalByMsObjectId = new Map([
      [adele.ms_object_id, ids.adele],
      [megan.ms_object_id, ids.megan],
      [pat.ms_object_id, ids.pat],
      [alex.ms_object_id, ids.alex],
      [CONTOSO_INTERNAL_USERS[5]!.ms_object_id, ids.allan],
      [CONTOSO_INTERNAL_USERS[4]!.ms_object_id, ids.joni],
    ])
    let n = 0
    const plan = planPrivilegedInventory({
      tenantId,
      now,
      definitions: DEMO_ROLE_DEFINITIONS,
      assignments: DEMO_ROLE_ASSIGNMENTS,
      existingRoles: [],
      existingAssignments: [],
      principalByMsObjectId,
      internalIdentityIds: Object.values(ids),
      generateId: () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`,
    })

    expect(plan.roles).toHaveLength(DEMO_ROLE_DEFINITIONS.length)
    expect(plan.assignments).toHaveLength(DEMO_ROLE_ASSIGNMENTS.length)
    expect(plan.roles.find((row) => row.ms_role_id === TIER_0_TEMPLATE_IDS['Global Administrator'])?.privilege_tier).toBe(0)
    expect(plan.roles.find((row) => row.ms_role_id === HELPDESK_ADMINISTRATOR_TEMPLATE_ID)?.privilege_tier).toBe(1)
    expect(plan.roles.find((row) => row.display_name === 'Directory Readers')?.tier_rule).toBe('excluded')
    expect(plan.roles.find((row) => row.display_name === 'Northwind Privileged Operators')?.tier_rule).toBe('custom_default')
    expect(plan.roles.find((row) => row.display_name === 'Reports Reader')?.privilege_tier).toBe(2)

    const patch = (id: string) => plan.identityPatches.find((row) => row.id === id)
    expect(patch(ids.adele)).toEqual({ id: ids.adele, is_privileged: true, privilege_tier: 0 })
    expect(patch(ids.megan)).toEqual({ id: ids.megan, is_privileged: true, privilege_tier: 1 })
    expect(patch(ids.alex)).toEqual({ id: ids.alex, is_privileged: true, privilege_tier: 2 })
    expect(patch(ids.pat)).toEqual({ id: ids.pat, is_privileged: false, privilege_tier: null })
    expect(patch(ids.joni)).toEqual({ id: ids.joni, is_privileged: false, privilege_tier: null })
    expect(plan.auditState).toEqual({
      roles: 9,
      assignments: 8,
      eligible_assignments: 0,
      group_eligibilities: 0,
      privileged_identities: 4,
      tier_map_version: TIER_MAP_VERSION,
      by_tier: { t0: 2, t1: 3, t2: 2, excluded: 2 },
      pim: 'skipped',
      pim_groups: 'skipped',
    })
    expect(plan.assignments.find((row) => row.ms_assignment_id === 'asg-alex-reports-reader-au')?.directory_scope_id).toBe(
      '/administrativeUnits/au-northwind-clinics',
    )
  })

  it('soft-removes roles and assignments that disappeared', () => {
    const plan = planPrivilegedInventory({
      tenantId,
      now,
      definitions: [],
      assignments: [],
      existingRoles: [{ id: 'role-old', ms_role_id: TIER_0_TEMPLATE_IDS['Global Administrator'], removed_at: null }],
      existingAssignments: [{ id: 'asg-old', ms_assignment_id: 'asg-adele-ga', removed_at: null }],
      principalByMsObjectId: new Map(),
      internalIdentityIds: [ids.adele],
    })
    expect(plan.removedRoleIds).toEqual(['role-old'])
    expect(plan.removedAssignmentIds).toEqual(['asg-old'])
    expect(plan.identityPatches).toEqual([{ id: ids.adele, is_privileged: false, privilege_tier: null }])
  })

  it('stores Graph isPrivileged without letting it set the tier', () => {
    const plan = planPrivilegedInventory({
      tenantId,
      now,
      definitions: [
        {
          ms_role_id: 'dir-readers',
          template_id: '88d8e3e3-8f55-4a1e-953a-9b9898b8876b',
          display_name: 'Directory Readers',
          is_built_in: true,
          ms_is_privileged: true,
        },
      ],
      assignments: [],
      existingRoles: [],
      existingAssignments: [],
      principalByMsObjectId: new Map(),
    })
    expect(plan.roles[0].ms_is_privileged).toBe(true)
    expect(plan.roles[0].is_privileged).toBe(false)
    expect(plan.roles[0].privilege_tier).toBeNull()
  })

  it('counts directory PIM eligibility toward privilege and leaves group PIM as inventory', () => {
    const miriam = CONTOSO_INTERNAL_USERS[11]!
    const principalByMsObjectId = new Map([
      [adele.ms_object_id, ids.adele],
      [megan.ms_object_id, ids.megan],
      [pat.ms_object_id, ids.pat],
      [alex.ms_object_id, ids.alex],
      [CONTOSO_INTERNAL_USERS[5]!.ms_object_id, ids.allan],
      [CONTOSO_INTERNAL_USERS[4]!.ms_object_id, ids.joni],
      [miriam.ms_object_id, ids.miriam],
    ])
    const plan = planPrivilegedInventory({
      tenantId,
      now,
      definitions: DEMO_ROLE_DEFINITIONS,
      assignments: [...DEMO_ROLE_ASSIGNMENTS, ...DEMO_PIM_ELIGIBILITIES],
      existingRoles: [],
      existingAssignments: [],
      principalByMsObjectId,
      internalIdentityIds: Object.values(ids),
      groupEligibilities: DEMO_GROUP_PIM_ELIGIBILITIES,
      pim: 'available',
      pimGroups: 'available',
    })
    expect(plan.assignments.filter((row) => row.assignment_type === 'eligible')).toHaveLength(2)
    expect(plan.assignments.find((row) => row.ms_assignment_id === 'elig-miriam-pra')?.pim_status).toBe('Provisioned')
    expect(plan.identityPatches.find((row) => row.id === ids.miriam)).toEqual({
      id: ids.miriam,
      is_privileged: true,
      privilege_tier: 0,
    })
    expect(plan.identityPatches.find((row) => row.id === ids.pat)).toEqual({
      id: ids.pat,
      is_privileged: false,
      privilege_tier: null,
    })
    expect(plan.groupEligibilities).toHaveLength(1)
    expect(plan.groupEligibilities[0]?.access_id).toBe('member')
    expect(plan.auditState).toMatchObject({
      assignments: 10,
      eligible_assignments: 2,
      group_eligibilities: 1,
      privileged_identities: 5,
      pim: 'available',
      pim_groups: 'available',
    })
  })

  it('does not soft-remove eligible rows omitted from reconcile when PIM is skipped', () => {
    const plan = planPrivilegedInventory({
      tenantId,
      now,
      definitions: DEMO_ROLE_DEFINITIONS,
      assignments: DEMO_ROLE_ASSIGNMENTS,
      existingRoles: [],
      existingAssignments: [{ id: 'asg-old-active', ms_assignment_id: 'asg-gone-active', removed_at: null }],
      principalByMsObjectId: new Map(),
      pim: 'skipped',
      pimGroups: 'skipped',
      existingGroupEligibilities: [],
    })
    expect(plan.removedAssignmentIds).toEqual(['asg-old-active'])
    expect(plan.removedGroupEligibilityIds).toEqual([])
  })

  it('soft-removes vanished eligibility when PIM reads are on', () => {
    const plan = planPrivilegedInventory({
      tenantId,
      now,
      definitions: DEMO_ROLE_DEFINITIONS,
      assignments: DEMO_ROLE_ASSIGNMENTS,
      existingRoles: [],
      existingAssignments: [{ id: 'asg-keep-eligible', ms_assignment_id: 'elig-miriam-pra', removed_at: null }],
      principalByMsObjectId: new Map(),
      groupEligibilities: [],
      existingGroupEligibilities: [{ id: 'grp-old', ms_schedule_id: 'grp-elig-pat-secops', removed_at: null }],
      pim: 'available',
      pimGroups: 'available',
    })
    expect(plan.removedAssignmentIds).toEqual(['asg-keep-eligible'])
    expect(plan.removedGroupEligibilityIds).toEqual(['grp-old'])
  })
})

describe('mapPimMemberType / scheduleBounds', () => {
  it('maps Graph memberType and permanent vs dated schedules', () => {
    expect(mapPimMemberType('Group')).toBe('group')
    expect(mapPimMemberType('Inherited')).toBe('inherited')
    expect(mapPimMemberType(null)).toBe('direct')
    expect(scheduleBounds({ startDateTime: '2026-01-01T00:00:00Z', expiration: { type: 'noExpiration' } })).toEqual({
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: null,
    })
    expect(
      scheduleBounds({
        startDateTime: '2026-01-01T00:00:00Z',
        expiration: { type: 'afterDateTime', endDateTime: '2027-01-01T00:00:00Z' },
      }),
    ).toEqual({ starts_at: '2026-01-01T00:00:00Z', ends_at: '2027-01-01T00:00:00Z' })
  })
})
