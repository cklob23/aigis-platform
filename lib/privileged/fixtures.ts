import type { IdentityClass, RiskLevel } from '@/lib/types'
import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'
import {
  buildHighestRiskHolders,
  buildPrivilegedHolders,
  buildPrivilegedRoles,
  emptyClassCounts,
  summarizePrivileged,
  type PrivilegedAssignmentRow,
  type PrivilegedDetail,
  type PrivilegedFindingCount,
  type PrivilegedIdentityRow,
  type PrivilegedRoleRow,
  type PrivilegedSummary,
} from '@/lib/privileged/view'

const NOW = Date.parse('2026-11-18T12:00:00.000Z')

function identity(
  id: string,
  display_name: string,
  primary_email: string,
  identity_class: IdentityClass,
  privilege_tier: 0 | 1 | 2,
  extra: Partial<PrivilegedIdentityRow> = {},
): PrivilegedIdentityRow {
  return {
    id,
    display_name,
    primary_email,
    identity_class,
    is_privileged: true,
    privilege_tier,
    last_reviewed_at: '2026-10-01T00:00:00.000Z',
    last_activity_at: '2026-11-18T10:00:00.000Z',
    risk_score: 42,
    risk_level: 'medium' as RiskLevel,
    status: 'active',
    owner_display_name: null,
    dedicated_admin: false,
    auth_methods: ['microsoftAuthenticatorAuthenticationMethod'],
    ...extra,
  }
}

const T0_ROLE_DEFS: { id: string; name: (typeof TIER_0_DIRECTORY_ROLES)[number] }[] = [
  { id: 'role-ga', name: 'Global Administrator' },
  { id: 'role-pra', name: 'Privileged Role Administrator' },
  { id: 'role-paa', name: 'Privileged Authentication Administrator' },
  { id: 'role-ca', name: 'Conditional Access Administrator' },
  { id: 'role-app', name: 'Application Administrator' },
  { id: 'role-cloud-app', name: 'Cloud Application Administrator' },
  { id: 'role-hybrid', name: 'Hybrid Identity Administrator' },
  { id: 'role-dirsync', name: 'Directory Synchronization Accounts' },
  { id: 'role-domain', name: 'Domain Name Administrator' },
  { id: 'role-ext-idp', name: 'External Identity Provider Administrator' },
  { id: 'role-auth-pol', name: 'Authentication Policy Administrator' },
  { id: 'role-partner', name: 'Partner Tier2 Support' },
]

const OTHER_ROLES: PrivilegedRoleRow[] = [
  { id: 'role-helpdesk', display_name: 'Helpdesk Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can reset passwords for non-administrators.' },
  { id: 'role-user-admin', display_name: 'User Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage users and groups.' },
  { id: 'role-groups', display_name: 'Groups Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage groups.' },
  { id: 'role-exchange', display_name: 'Exchange Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage Exchange Online.' },
  { id: 'role-intune', display_name: 'Intune Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage Microsoft Intune.' },
  { id: 'role-sharepoint', display_name: 'SharePoint Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage SharePoint Online.' },
  { id: 'role-teams', display_name: 'Teams Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage Microsoft Teams.' },
  { id: 'role-auth-admin', display_name: 'Authentication Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can set authentication methods for non-admins.' },
  { id: 'role-password', display_name: 'Password Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can reset passwords for non-administrators and Password Administrators.' },
  { id: 'role-custom', display_name: 'Northwind Clinic Admin', privilege_tier: 1, is_privileged: true, is_built_in: false, description: 'Custom role for clinic operators.' },
  { id: 'role-global-reader', display_name: 'Global Reader', privilege_tier: 2, is_privileged: true, is_built_in: true, description: 'Can read everything that a Global Administrator can.' },
  { id: 'role-security-reader', display_name: 'Security Reader', privilege_tier: 2, is_privileged: true, is_built_in: true, description: 'Can read security information and reports.' },
  { id: 'role-reports-reader', display_name: 'Reports Reader', privilege_tier: 2, is_privileged: true, is_built_in: true, description: 'Can read sign-in and audit reports.' },
  { id: 'role-message-center', display_name: 'Message Center Reader', privilege_tier: 2, is_privileged: true, is_built_in: true, description: 'Can read Message Center posts.' },
  { id: 'role-directory-readers', display_name: 'Directory Readers', privilege_tier: null, is_privileged: false, is_built_in: true, description: 'Can read basic directory information.' },
  { id: 'role-guest-inviter', display_name: 'Guest Inviter', privilege_tier: null, is_privileged: false, is_built_in: true, description: 'Can invite guest users.' },
]

const ROLES: PrivilegedRoleRow[] = [
  ...T0_ROLE_DEFS.map((row) => ({
    id: row.id,
    display_name: row.name,
    privilege_tier: 0 as const,
    is_privileged: true,
    is_built_in: true,
    description: null,
  })),
  ...OTHER_ROLES,
]

const IDENTITIES: PrivilegedIdentityRow[] = [
  identity('id-adele', 'Adele Vance', 'adele.vance@northwind.example', 'human_internal', 0, {
    last_activity_at: '2026-11-18T10:00:00.000Z',
    risk_score: 71,
    risk_level: 'high',
  }),
  identity('id-lee', 'Lee Gu', 'lee.gu@northwind.example', 'human_internal', 0, {
    dedicated_admin: true,
    owner_display_name: 'Identity team',
    last_reviewed_at: '2026-07-01T00:00:00.000Z',
    last_activity_at: '2026-11-14T00:00:00.000Z',
    risk_score: 88,
    risk_level: 'critical',
  }),
  identity('id-priya', 'Priya Nair', 'priya.nair@northwind.example', 'human_internal', 0, {
    auth_methods: [],
    last_activity_at: '2026-11-07T00:00:00.000Z',
    risk_score: 82,
    risk_level: 'critical',
  }),
  identity('id-megan', 'Megan Bowen', 'megan.bowen@northwind.example', 'human_internal', 1, {
    last_activity_at: '2026-11-17T00:00:00.000Z',
    risk_score: 34,
    risk_level: 'medium',
  }),
  identity('id-grady', 'Grady Archie', 'grady.archie@fabrikam.example', 'external', 1, {
    auth_methods: [],
    last_reviewed_at: '2026-09-01T00:00:00.000Z',
    last_activity_at: '2026-08-16T00:00:00.000Z',
    risk_score: 76,
    risk_level: 'high',
  }),
  identity('id-isaiah', 'Isaiah Langer', 'isaiah.langer@northwind.example', 'human_internal', 1, {
    last_activity_at: '2026-11-18T06:00:00.000Z',
    risk_score: 29,
    risk_level: 'low',
  }),
  identity('id-hr-sync', 'Contoso-HR-Sync', 'hr-sync@northwind.example', 'non_human', 0, {
    auth_methods: null,
    last_activity_at: '2026-11-17T18:00:00.000Z',
    risk_score: 79,
    risk_level: 'high',
  }),
  identity('id-alex', 'Alex Wilber', 'alex.wilber@northwind.example', 'human_internal', 2, {
    last_activity_at: '2026-11-15T00:00:00.000Z',
    risk_score: 12,
    risk_level: 'low',
  }),
  identity('id-nestor', 'Nestor Wilke', 'nestor.wilke@northwind.example', 'human_internal', 1, {
    last_activity_at: '2026-10-28T00:00:00.000Z',
    risk_score: 41,
    risk_level: 'medium',
  }),
  identity('id-lynne', 'Lynne Robbins', 'lynne.robbins@northwind.example', 'human_internal', 2, {
    last_reviewed_at: null,
    last_activity_at: null,
    risk_score: 38,
    risk_level: 'medium',
  }),
  identity('id-diego', 'Diego Siciliani', 'diego.siciliani@northwind.example', 'human_internal', 0, {
    dedicated_admin: true,
    owner_display_name: 'Identity team',
    last_activity_at: '2026-11-18T04:00:00.000Z',
    risk_score: 27,
    risk_level: 'low',
  }),
  identity('id-vendor', 'Fabrikam Vendor', 'vendor@fabrikam.example', 'external', 1, {
    last_reviewed_at: null,
    last_activity_at: '2026-06-01T00:00:00.000Z',
    risk_score: 64,
    risk_level: 'high',
    auth_methods: [],
  }),
]

function assignment(
  id: string,
  principal: string,
  role: string,
  extra: Partial<PrivilegedAssignmentRow> = {},
): PrivilegedAssignmentRow {
  return {
    id,
    principal_identity_id: principal,
    assignment_type: 'active',
    member_type: 'direct',
    pim_status: null,
    starts_at: null,
    ends_at: null,
    directory_scope_id: '/',
    directory_role_id: role,
    ...extra,
  }
}

const ASSIGNMENTS: PrivilegedAssignmentRow[] = [
  assignment('asg-adele-ga', 'id-adele', 'role-ga'),
  assignment('elig-adele-ga', 'id-adele', 'role-ga', { assignment_type: 'eligible', pim_status: 'Provisioned' }),
  assignment('asg-lee-pra', 'id-lee', 'role-pra'),
  assignment('asg-priya-paa', 'id-priya', 'role-paa'),
  assignment('elig-megan-user', 'id-megan', 'role-user-admin', { assignment_type: 'eligible', pim_status: 'Provisioned' }),
  assignment('asg-grady-helpdesk', 'id-grady', 'role-helpdesk'),
  assignment('asg-isaiah-groups', 'id-isaiah', 'role-groups', { ends_at: '2026-12-01T00:00:00.000Z' }),
  assignment('asg-hr-hybrid', 'id-hr-sync', 'role-hybrid'),
  assignment('elig-alex-gr', 'id-alex', 'role-global-reader', { assignment_type: 'eligible', pim_status: 'Provisioned' }),
  assignment('asg-nestor-ex', 'id-nestor', 'role-exchange'),
  assignment('asg-lynne-sr', 'id-lynne', 'role-security-reader'),
  assignment('elig-diego-app', 'id-diego', 'role-app', { assignment_type: 'eligible', pim_status: 'Provisioned' }),
  assignment('asg-vendor-helpdesk', 'id-vendor', 'role-helpdesk'),
  assignment('asg-adele-dir-readers', 'id-adele', 'role-directory-readers'),
]

const P2_FINDINGS: PrivilegedFindingCount[] = [
  {
    finding_type: 'too_many_global_admins',
    title: '7 Global Administrators',
    count: 7,
    explanation: 'Microsoft guidance is fewer than five.',
  },
  {
    finding_type: 'no_strong_auth',
    title: '5 privileged identities without strong authentication',
    count: 5,
    explanation: 'No authenticator app, FIDO2 key, or Windows Hello registered.',
  },
  {
    finding_type: 'sp_with_role',
    title: '4 service principals with admin roles',
    count: 4,
    explanation: 'Flagged here. Full app review comes with non-human identities.',
  },
  {
    finding_type: 'role_via_unowned_group',
    title: '1 unowned role-assignable group',
    count: 1,
    explanation: 'A role-assignable group that grants an admin role has no owner.',
  },
  {
    finding_type: 'permanent_tier0',
    title: 'Standing Tier 0 assignment',
    count: 14,
    explanation: 'Standing (permanent) Tier 0 assignment while PIM is available.',
  },
  {
    finding_type: 'guest_with_role',
    title: 'External identity with an admin role',
    count: 3,
    explanation: 'An external identity holds a privileged directory role (any tier).',
  },
]

const NO_P2_FINDINGS: PrivilegedFindingCount[] = [
  {
    finding_type: 'too_many_global_admins',
    title: '6 Global Administrators',
    count: 6,
    explanation: 'Microsoft guidance is fewer than five.',
  },
  {
    finding_type: 'guest_with_role',
    title: 'External identity with an admin role',
    count: 1,
    explanation: 'An external identity holds a privileged directory role (any tier).',
  },
  {
    finding_type: 'permanent_tier0',
    title: 'Standing Tier 0 assignment',
    count: 6,
    explanation: 'Standing (permanent) Tier 0 assignment while PIM is available.',
  },
]

const TOP_FACTORS: Record<string, string> = {
  'id-lee': 'Permanent Tier 0 assignment',
  'id-priya': 'No strong authentication',
  'id-grady': 'Dormant 90d+',
  'id-hr-sync': 'Service principal with a role',
}

function p2Summary(computed: PrivilegedSummary): PrivilegedSummary {
  return {
    ...computed,
    holders: 98,
    assignments: 142,
    standing: 64,
    jitEligible: 71,
    timeBound: 7,
    activated: 0,
    byTier: { t0: 21, t1: 53, t2: 24 },
    byClass: {
      ...emptyClassCounts(),
      human_internal: 91,
      external: 3,
      non_human: 4,
    },
    byTierAssignments: {
      t0: { holders: 21, permanent: 14, eligible: 13, timeBound: 1 },
      t1: { holders: 53, permanent: 34, eligible: 31, timeBound: 5 },
      t2: { holders: 24, permanent: 16, eligible: 27, timeBound: 1 },
    },
    whoHolds: {
      internalUser: 84,
      dedicatedAdmin: 7,
      guests: 3,
      servicePrincipals: 4,
      viaGroups: 11,
    },
    neverReviewed: 6,
    overdueReviews: 4,
    dormant: 7,
    findings: computed.findings.filter((row) => row.finding_type !== 'permanent_tier0' || computed.pimAvailable),
    reviews: {
      cadenceDays: 90,
      lastCompletedAt: '2026-08-20T00:00:00.000Z',
      nextDueAt: '2026-12-11T00:00:00.000Z',
      openRequests: 5,
      awaitingApproval: 2,
    },
    remediationCount: 5,
  }
}

function noP2Summary(computed: PrivilegedSummary): PrivilegedSummary {
  return {
    ...computed,
    holders: 52,
    assignments: 74,
    standing: 74,
    jitEligible: 0,
    timeBound: 0,
    activated: 0,
    pimAvailable: false,
    byTier: { t0: 6, t1: 29, t2: 17 },
    byClass: {
      ...emptyClassCounts(),
      human_internal: 51,
      external: 1,
      non_human: 0,
    },
    byTierAssignments: {
      t0: { holders: 6, permanent: 6, eligible: 0, timeBound: 0 },
      t1: { holders: 29, permanent: 29, eligible: 0, timeBound: 0 },
      t2: { holders: 17, permanent: 17, eligible: 0, timeBound: 0 },
    },
    whoHolds: {
      internalUser: 47,
      dedicatedAdmin: 4,
      guests: 1,
      servicePrincipals: 0,
      viaGroups: 3,
    },
    neverReviewed: 2,
    overdueReviews: 1,
    dormant: 4,
    findings: computed.findings,
    reviews: {
      cadenceDays: 90,
      lastCompletedAt: '2026-08-20T00:00:00.000Z',
      nextDueAt: '2026-12-11T00:00:00.000Z',
      openRequests: 0,
      awaitingApproval: 0,
    },
    remediationCount: 0,
  }
}

export function privilegedFixture(pimAvailable: boolean, now = NOW): PrivilegedDetail {
  const findings = pimAvailable ? P2_FINDINGS : NO_P2_FINDINGS
  const computed = summarizePrivileged(IDENTITIES, ASSIGNMENTS, ROLES, pimAvailable, findings, now)
  const summary = pimAvailable ? p2Summary(computed) : noP2Summary(computed)
  const holders = buildPrivilegedHolders(IDENTITIES, ASSIGNMENTS, ROLES, pimAvailable, TOP_FACTORS)
  const roles = buildPrivilegedRoles(ROLES, ASSIGNMENTS, IDENTITIES, pimAvailable).map((role) => {
    if (!pimAvailable) return role
    if (role.displayName === 'Partner Tier2 Support') return role
    if (role.isPrivileged && role.holderCount === 0) return { ...role, holderCount: 1 }
    return role
  })
  return {
    summary,
    holders,
    highestRisk: buildHighestRiskHolders(holders),
    roles,
  }
}

export function privilegedSummaryFixture(pimAvailable: boolean, now = NOW): PrivilegedSummary {
  return privilegedFixture(pimAvailable, now).summary
}

export const FIXTURE_PRIVILEGE_TIERS: Record<string, 0 | 1 | 2> = {
  'guest-id-vendor': 1,
  'id-grady': 1,
  'id-vendor': 1,
}
