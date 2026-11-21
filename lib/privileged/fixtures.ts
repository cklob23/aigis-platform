import type { IdentityClass, RiskLevel } from '@/lib/types'
import {
  buildPrivilegedHolders,
  buildPrivilegedRoles,
  summarizePrivileged,
  type PrivilegedAssignmentRow,
  type PrivilegedDetail,
  type PrivilegedIdentityRow,
  type PrivilegedRoleRow,
  type PrivilegedSummary,
} from '@/lib/privileged/view'

const NOW = Date.parse('2026-11-21T12:00:00.000Z')

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
    last_activity_at: '2026-11-20T00:00:00.000Z',
    risk_score: 42,
    risk_level: 'medium' as RiskLevel,
    status: 'active',
    ...extra,
  }
}

const ROLES: PrivilegedRoleRow[] = [
  { id: 'role-ga', display_name: 'Global Administrator', privilege_tier: 0, is_privileged: true, is_built_in: true, description: 'Can manage all aspects of Microsoft Entra ID.' },
  { id: 'role-pra', display_name: 'Privileged Role Administrator', privilege_tier: 0, is_privileged: true, is_built_in: true, description: 'Can manage role assignments in Microsoft Entra ID.' },
  { id: 'role-helpdesk', display_name: 'Helpdesk Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can reset passwords for non-administrators.' },
  { id: 'role-user-admin', display_name: 'User Administrator', privilege_tier: 1, is_privileged: true, is_built_in: true, description: 'Can manage users and groups.' },
  { id: 'role-global-reader', display_name: 'Global Reader', privilege_tier: 2, is_privileged: true, is_built_in: true, description: 'Can read everything that a Global Administrator can.' },
  { id: 'role-reports-reader', display_name: 'Reports Reader', privilege_tier: 2, is_privileged: true, is_built_in: true, description: 'Can read sign-in and audit reports.' },
  { id: 'role-directory-readers', display_name: 'Directory Readers', privilege_tier: null, is_privileged: false, is_built_in: true, description: 'Can read basic directory information.' },
  { id: 'role-guest-inviter', display_name: 'Guest Inviter', privilege_tier: null, is_privileged: false, is_built_in: true, description: 'Can invite guest users.' },
  { id: 'role-custom', display_name: 'Northwind Clinic Admin', privilege_tier: 1, is_privileged: true, is_built_in: false, description: 'Custom role for clinic operators.' },
]

const IDENTITIES: PrivilegedIdentityRow[] = [
  identity('id-adele', 'Adele Admin', 'adele.admin@northwind.example', 'human_internal', 0, { risk_score: 88, risk_level: 'critical' }),
  identity('id-megan', 'Megan Bowen', 'megan.bowen@northwind.example', 'human_internal', 1, { risk_score: 55, risk_level: 'high' }),
  identity('id-allan', 'Allan Deyoung', 'allan.deyoung@northwind.example', 'human_internal', 1),
  identity('id-alex', 'Alex Wilber', 'alex.wilber@northwind.example', 'human_internal', 2, { risk_score: 18, risk_level: 'low' }),
  identity('id-miriam', 'Miriam Graham', 'miriam.graham@northwind.example', 'human_internal', 0, {
    last_reviewed_at: '2026-08-01T00:00:00.000Z',
    risk_score: 71,
    risk_level: 'high',
  }),
  identity('id-guest', 'Fabrikam Vendor', 'vendor@fabrikam.example', 'external', 1, {
    last_reviewed_at: null,
    last_activity_at: '2026-06-01T00:00:00.000Z',
    risk_score: 64,
    risk_level: 'high',
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
  assignment('asg-megan-helpdesk', 'id-megan', 'role-helpdesk'),
  assignment('asg-allan-user-admin', 'id-allan', 'role-user-admin'),
  assignment('asg-alex-global-reader', 'id-alex', 'role-global-reader'),
  assignment('asg-alex-reports', 'id-alex', 'role-reports-reader', {
    directory_scope_id: '/administrativeUnits/au-northwind-clinics',
  }),
  assignment('asg-megan-custom', 'id-megan', 'role-custom'),
  assignment('elig-miriam-pra', 'id-miriam', 'role-pra', {
    assignment_type: 'eligible',
    pim_status: 'Provisioned',
    starts_at: '2026-01-01T00:00:00.000Z',
  }),
  assignment('elig-adele-ga', 'id-adele', 'role-ga', {
    assignment_type: 'eligible',
    pim_status: 'Provisioned',
  }),
  assignment('asg-guest-helpdesk', 'id-guest', 'role-helpdesk'),
]

const FINDINGS = [
  { finding_type: 'permanent_tier0', title: 'Standing Tier 0 assignment', count: 1 },
  { finding_type: 'guest_with_role', title: 'Guest holds a directory role', count: 1 },
  { finding_type: 'privileged_review_overdue', title: 'Privileged access review overdue', count: 1 },
]

export function privilegedFixture(pimAvailable: boolean, now = NOW): PrivilegedDetail {
  const summary = summarizePrivileged(IDENTITIES, ASSIGNMENTS, pimAvailable, FINDINGS, now)
  return {
    summary: {
      ...summary,
      holders: pimAvailable ? 64 : 18,
      assignments: pimAvailable ? 71 : 18,
      jitEligible: pimAvailable ? 7 : 0,
      standing: pimAvailable ? 64 : 18,
      byClass: {
        ...summary.byClass,
        human_internal: pimAvailable ? 56 : 16,
        external: pimAvailable ? 5 : 2,
        non_human: pimAvailable ? 2 : 0,
        group: pimAvailable ? 1 : 0,
      },
      byTier: pimAvailable ? { t0: 8, t1: 42, t2: 14 } : { t0: 3, t1: 11, t2: 4 },
      neverReviewed: pimAvailable ? 6 : 2,
      overdueReviews: pimAvailable ? 4 : 1,
      dormant: pimAvailable ? 9 : 3,
    },
    holders: buildPrivilegedHolders(IDENTITIES, ASSIGNMENTS, ROLES, pimAvailable),
    roles: buildPrivilegedRoles(ROLES, ASSIGNMENTS, pimAvailable),
  }
}

export function privilegedSummaryFixture(pimAvailable: boolean, now = NOW): PrivilegedSummary {
  return privilegedFixture(pimAvailable, now).summary
}

export const FIXTURE_PRIVILEGE_TIERS: Record<string, 0 | 1 | 2> = {
  'guest-id-vendor': 1,
}
