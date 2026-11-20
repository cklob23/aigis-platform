import { CONTOSO_INTERNAL_USERS } from '@/lib/demo/internal-users'
import type { IncomingGroupPimEligibility, IncomingRoleAssignment, IncomingRoleDefinition } from '@/lib/privileged/ingest'
import {
  EXCLUDED_TEMPLATE_IDS,
  HELPDESK_ADMINISTRATOR_TEMPLATE_ID,
  TIER_0_TEMPLATE_IDS,
  TIER_2_FIXED_TEMPLATE_IDS,
} from '@/lib/privileged/tiers'

const pat = CONTOSO_INTERNAL_USERS[0]!
const adele = CONTOSO_INTERNAL_USERS[1]!
const megan = CONTOSO_INTERNAL_USERS[2]!
const alex = CONTOSO_INTERNAL_USERS[3]!
const joni = CONTOSO_INTERNAL_USERS[4]!
const allan = CONTOSO_INTERNAL_USERS[5]!
const miriam = CONTOSO_INTERNAL_USERS[11]!

const USER_ADMINISTRATOR_TEMPLATE_ID = 'fe930be7-5e62-47db-91af-98c3a49a38b1'
const REPORTS_READER_TEMPLATE_ID = '4a5d8f65-41da-4de4-8968-e035b65339cf'
export const DEMO_CUSTOM_ROLE_ID = 'cccccccc-cccc-cccc-cccc-ccccccccc901'

/**
 * Mock 02: directory role definitions covering T0, T1 (Helpdesk), T2,
 * excluded, custom, and a Reader-suffix built-in.
 */
export const DEMO_ROLE_DEFINITIONS: IncomingRoleDefinition[] = [
  {
    ms_role_id: TIER_0_TEMPLATE_IDS['Global Administrator'],
    template_id: TIER_0_TEMPLATE_IDS['Global Administrator'],
    display_name: 'Global Administrator',
    description: 'Can manage all aspects of Microsoft Entra ID.',
    is_built_in: true,
    ms_is_privileged: true,
  },
  {
    ms_role_id: TIER_0_TEMPLATE_IDS['Privileged Role Administrator'],
    template_id: TIER_0_TEMPLATE_IDS['Privileged Role Administrator'],
    display_name: 'Privileged Role Administrator',
    is_built_in: true,
    ms_is_privileged: true,
  },
  {
    ms_role_id: HELPDESK_ADMINISTRATOR_TEMPLATE_ID,
    template_id: HELPDESK_ADMINISTRATOR_TEMPLATE_ID,
    display_name: 'Helpdesk Administrator',
    is_built_in: true,
    ms_is_privileged: true,
  },
  {
    ms_role_id: USER_ADMINISTRATOR_TEMPLATE_ID,
    template_id: USER_ADMINISTRATOR_TEMPLATE_ID,
    display_name: 'User Administrator',
    is_built_in: true,
    ms_is_privileged: true,
  },
  {
    ms_role_id: TIER_2_FIXED_TEMPLATE_IDS['Global Reader'],
    template_id: TIER_2_FIXED_TEMPLATE_IDS['Global Reader'],
    display_name: 'Global Reader',
    is_built_in: true,
    ms_is_privileged: true,
  },
  {
    ms_role_id: REPORTS_READER_TEMPLATE_ID,
    template_id: REPORTS_READER_TEMPLATE_ID,
    display_name: 'Reports Reader',
    is_built_in: true,
    ms_is_privileged: false,
  },
  {
    ms_role_id: EXCLUDED_TEMPLATE_IDS['Directory Readers'],
    template_id: EXCLUDED_TEMPLATE_IDS['Directory Readers'],
    display_name: 'Directory Readers',
    is_built_in: true,
    ms_is_privileged: false,
  },
  {
    ms_role_id: EXCLUDED_TEMPLATE_IDS['Guest Inviter'],
    template_id: EXCLUDED_TEMPLATE_IDS['Guest Inviter'],
    display_name: 'Guest Inviter',
    is_built_in: true,
    ms_is_privileged: false,
  },
  {
    ms_role_id: DEMO_CUSTOM_ROLE_ID,
    template_id: DEMO_CUSTOM_ROLE_ID,
    display_name: 'Northwind Privileged Operators',
    description: 'Custom tenant role for privileged operators.',
    is_built_in: false,
    ms_is_privileged: false,
  },
]

/**
 * Mock 03: active assignments of T0 / T1 / T2 roles to Contoso internals.
 */
export const DEMO_ROLE_ASSIGNMENTS_MOCK_03: IncomingRoleAssignment[] = [
  {
    ms_assignment_id: 'asg-adele-ga',
    ms_role_id: TIER_0_TEMPLATE_IDS['Global Administrator'],
    principal_ms_object_id: adele.ms_object_id,
    directory_scope_id: '/',
  },
  {
    ms_assignment_id: 'asg-megan-helpdesk',
    ms_role_id: HELPDESK_ADMINISTRATOR_TEMPLATE_ID,
    principal_ms_object_id: megan.ms_object_id,
    directory_scope_id: '/',
  },
  {
    ms_assignment_id: 'asg-allan-user-admin',
    ms_role_id: USER_ADMINISTRATOR_TEMPLATE_ID,
    principal_ms_object_id: allan.ms_object_id,
    directory_scope_id: '/',
  },
]

/**
 * Mock 07: excluded roles, custom role, Reader-suffix T2, and a scoped assignment.
 */
export const DEMO_ROLE_ASSIGNMENTS_MOCK_07: IncomingRoleAssignment[] = [
  {
    ms_assignment_id: 'asg-pat-directory-readers',
    ms_role_id: EXCLUDED_TEMPLATE_IDS['Directory Readers'],
    principal_ms_object_id: pat.ms_object_id,
    directory_scope_id: '/',
  },
  {
    ms_assignment_id: 'asg-joni-guest-inviter',
    ms_role_id: EXCLUDED_TEMPLATE_IDS['Guest Inviter'],
    principal_ms_object_id: joni.ms_object_id,
    directory_scope_id: '/',
  },
  {
    ms_assignment_id: 'asg-megan-custom',
    ms_role_id: DEMO_CUSTOM_ROLE_ID,
    principal_ms_object_id: megan.ms_object_id,
    directory_scope_id: '/',
  },
  {
    ms_assignment_id: 'asg-alex-reports-reader-au',
    ms_role_id: REPORTS_READER_TEMPLATE_ID,
    principal_ms_object_id: alex.ms_object_id,
    directory_scope_id: '/administrativeUnits/au-northwind-clinics',
  },
  {
    ms_assignment_id: 'asg-alex-global-reader',
    ms_role_id: TIER_2_FIXED_TEMPLATE_IDS['Global Reader'],
    principal_ms_object_id: alex.ms_object_id,
    directory_scope_id: '/',
  },
]

export const DEMO_ROLE_ASSIGNMENTS: IncomingRoleAssignment[] = [
  ...DEMO_ROLE_ASSIGNMENTS_MOCK_03,
  ...DEMO_ROLE_ASSIGNMENTS_MOCK_07,
]

export const DEMO_PIM_GROUP_ID = 'demo-pim-group-secops'

/** Section 11: directory PIM eligibility plus one PIM-for-Groups eligibility. */
export const DEMO_PIM_ELIGIBILITIES: IncomingRoleAssignment[] = [
  {
    ms_assignment_id: 'elig-miriam-pra',
    ms_role_id: TIER_0_TEMPLATE_IDS['Privileged Role Administrator'],
    principal_ms_object_id: miriam.ms_object_id,
    directory_scope_id: '/',
    assignment_type: 'eligible',
    member_type: 'direct',
    pim_status: 'Provisioned',
    starts_at: '2026-01-01T00:00:00.000Z',
    ends_at: null,
  },
  {
    ms_assignment_id: 'elig-adele-ga',
    ms_role_id: TIER_0_TEMPLATE_IDS['Global Administrator'],
    principal_ms_object_id: adele.ms_object_id,
    directory_scope_id: '/',
    assignment_type: 'eligible',
    member_type: 'direct',
    pim_status: 'Provisioned',
    starts_at: null,
    ends_at: null,
  },
]

export const DEMO_GROUP_PIM_ELIGIBILITIES: IncomingGroupPimEligibility[] = [
  {
    ms_schedule_id: 'grp-elig-pat-secops',
    group_ms_object_id: DEMO_PIM_GROUP_ID,
    principal_ms_object_id: pat.ms_object_id,
    access_id: 'member',
    member_type: 'direct',
    pim_status: 'Provisioned',
    starts_at: '2026-02-01T00:00:00.000Z',
    ends_at: '2027-02-01T00:00:00.000Z',
  },
]
