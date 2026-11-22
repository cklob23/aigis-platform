import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'

export const DASHBOARD_SUBTITLE_GUESTS_ONLY =
  'Governing external identities today. Privileged, non-human, and AI agent types will use the same reviews and audit model.'

export const DASHBOARD_SUBTITLE_PRIVILEGED =
  'Governing external and privileged access today. Non-human and AI agent types will use the same reviews and audit model.'

export const PRIVILEGED_NAV_LABEL = 'Privileged access'

export const AZURE_RBAC_COMING_LATER = 'Coming later'

export const AZURE_RBAC_FILTER_PILL = 'Azure RBAC · Coming later'

export const REMEDIATION_PLACEHOLDER =
  "Remediation is coming soon. You'll request a change, get approval, make it in Microsoft, use Mark change made, and AIGIS confirms it on the next scan."

export const READ_ONLY_PRIVILEGED_TITLE = 'Details are limited to audit roles'

export const READ_ONLY_PRIVILEGED_DESCRIPTION =
  'You can see totals. Names, roles, assignments, and risk details are visible to Global Administrator, AIGIS Administrator, Security Analyst, and Auditor roles. Ask an AIGIS Administrator if you need access.'

export const PRIVILEGED_DETAIL_DENIED =
  'Your role can see privileged totals only. Identity names and this profile are not available.'

export const PIM_ACTIVATION_WINDOW = 'Last 30 days'

export const PIM_ACTIVATION_NOTE =
  'Entra keeps directory audit logs for 30 days. AIGIS will show 90 days of history once it has collected that much.'

export const PRIVILEGED_RECOMMENDATION_NOTE =
  'This is a recommendation. A human still has to request and approve any change in Microsoft Entra. AIGIS never changes Entra for privileged access.'

export const OPEN_IN_ENTRA = 'Open in Microsoft Entra'

export const EXCLUDED_ROLES_NOTE =
  'Not counted as privileged. Directory Readers and Guest Inviter are excluded, so holders of only those roles do not appear here or in privileged reviews.'

export const TIERS_FIXED_NOTE = "Tiers are fixed. Each role's tier is set by AIGIS and cannot be changed per tenant."

export const TIER_1_DEFINITION =
  'Every other admin role, including Helpdesk Administrator, custom roles, and new built-in roles Microsoft adds later.'

export const TIER_2_DEFINITION =
  'Global Reader, Security Reader, and other built-in Reader roles except Directory Readers.'

export const PIM_BANNER_TITLE = 'PIM details need Microsoft Entra ID P2'

export const PIM_BANNER_BODY =
  'This tenant has Entra ID P1, so Microsoft does not provide Privileged Identity Management data. AIGIS shows every role as active, because it cannot tell eligible from permanent.'

export const PIM_STILL_WORKS = [
  'Who holds each role',
  'Tier 0 / 1 / 2 counts',
  'Dormant admins',
  'Privileged reviews (permanent assignments)',
] as const

export const PIM_NOT_AVAILABLE = [
  'Eligible (just-in-time) assignments',
  'Standing vs just-in-time breakdown',
  'Time-bound assignments',
] as const

export const ENTRA_P2_DOCS = 'https://learn.microsoft.com/en-us/entra/id-governance/privileged-identity-management/pim-configure'

export function privilegedDashboardCardSubtitle(holders: number, assignments: number) {
  return `${holders} identities hold ${assignments} Entra admin role assignments. Privilege is a flag on the identity, so external identities and service principals with roles also count here.`
}

export function privilegedRolesSubtitle(privilegedRoles: number, held: number) {
  return `${privilegedRoles} privileged roles, ${held} held in this tenant. Per role: who holds it, how many are permanent, and when it was last reviewed.`
}

export function pimUnavailableStandingLabel(assignments: number) {
  return `all ${assignments} shown as active`
}

export const TIER_0_ROLE_DESCRIPTIONS: Record<(typeof TIER_0_DIRECTORY_ROLES)[number], string> = {
  'Global Administrator': 'Can manage all of Microsoft Entra ID and Microsoft services that use Entra identities.',
  'Privileged Role Administrator': 'Can manage Entra role assignments and Privileged Identity Management.',
  'Privileged Authentication Administrator': 'Can set or reset authentication methods for any user, including Global Administrators.',
  'Conditional Access Administrator': 'Can manage Microsoft Entra Conditional Access settings.',
  'Application Administrator': 'Can create and manage app registrations and enterprise apps.',
  'Cloud Application Administrator': 'Can manage app registrations and enterprise apps except App Proxy.',
  'Hybrid Identity Administrator': 'Can manage Microsoft Entra Connect, pass-through authentication, and federation.',
  'Directory Synchronization Accounts': 'Used only by Microsoft Entra Connect.',
  'Domain Name Administrator': 'Can manage domain names in Microsoft Entra ID and Microsoft 365.',
  'External Identity Provider Administrator': 'Can configure identity providers for direct federation.',
  'Authentication Policy Administrator': 'Can configure authentication methods policy, MFA, and password protection.',
  'Partner Tier2 Support': 'Can reset passwords and session tokens for non-administrators and some admin roles.',
}

export function tier0RoleDescription(name: string): string | null {
  return TIER_0_ROLE_DESCRIPTIONS[name as keyof typeof TIER_0_ROLE_DESCRIPTIONS] ?? null
}
