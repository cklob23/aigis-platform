/**
 * Entra directory role tiers for privileged inventory.
 *
 * Template IDs are verified against Microsoft's built-in role list:
 * https://learn.microsoft.com/en-us/entra/identity/role-based-access-control/permissions-reference
 *
 * Caleb's mapping (overrides the Phase 2 plan section 4):
 *   Tier 0: the 12 roles below, by template ID.
 *   Tier 2: Global Reader, Security Reader, and other built-in roles whose
 *           names end in "Reader", except Directory Readers.
 *   Tier 1: every other admin role, including Helpdesk Administrator,
 *           unknown/new built-in roles (default_t1), and custom roles
 *           (custom_default).
 *   Excluded (stored, not privileged): Directory Readers, Guest Inviter.
 *
 * Graph `isPrivileged` (ms_is_privileged) is informational only and never
 * sets the tier.
 */
export const TIER_MAP_VERSION = '2026-11-20.1'

export const TIER_0_DIRECTORY_ROLES = [
  'Global Administrator',
  'Privileged Role Administrator',
  'Privileged Authentication Administrator',
  'Conditional Access Administrator',
  'Application Administrator',
  'Cloud Application Administrator',
  'Hybrid Identity Administrator',
  'Directory Synchronization Accounts',
  'Domain Name Administrator',
  'External Identity Provider Administrator',
  'Authentication Policy Administrator',
  'Partner Tier2 Support',
] as const

export const TIER_2_FIXED_DIRECTORY_ROLES = ['Global Reader', 'Security Reader'] as const

export const TIER_1_EXCLUDED_DIRECTORY_ROLES = ['Directory Readers', 'Guest Inviter'] as const

/** Microsoft built-in role template IDs for the 12 Tier 0 roles. */
export const TIER_0_TEMPLATE_IDS: Record<(typeof TIER_0_DIRECTORY_ROLES)[number], string> = {
  'Global Administrator': '62e90394-69f5-4237-9190-012177145e10',
  'Privileged Role Administrator': 'e8611ab8-c189-46e8-94e1-60213ab1f814',
  'Privileged Authentication Administrator': '7be44c8a-adaf-4e2a-84d6-ab2649e08a13',
  'Conditional Access Administrator': 'b1be1c3e-b65d-4f19-8427-f6fa0d97feb9',
  'Application Administrator': '9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3',
  'Cloud Application Administrator': '158c047a-c907-4556-b7ef-446551a6b5f7',
  'Hybrid Identity Administrator': '8ac3fc64-6eca-42ea-9e69-59f4c7b60eb2',
  'Directory Synchronization Accounts': 'd29b2b05-8046-44ba-8758-1e26182fcf32',
  'Domain Name Administrator': '8329153b-31d0-4727-b945-745eb3bc5f31',
  'External Identity Provider Administrator': 'be2f45a1-457d-42af-a067-6ec1fa63bc45',
  'Authentication Policy Administrator': '0526716b-113d-4c15-b2c8-68e3c22b9f80',
  'Partner Tier2 Support': 'e00e864a-17c5-4a4b-9c06-f5b95a8d5bd8',
}

export const TIER_2_FIXED_TEMPLATE_IDS: Record<(typeof TIER_2_FIXED_DIRECTORY_ROLES)[number], string> = {
  'Global Reader': 'f2ef992c-3afb-46b9-b7cf-a126ee74c451',
  'Security Reader': '5d6b6bb7-de71-4623-b4af-96380a352509',
}

export const EXCLUDED_TEMPLATE_IDS: Record<(typeof TIER_1_EXCLUDED_DIRECTORY_ROLES)[number], string> = {
  'Directory Readers': '88d8e3e3-8f55-4a1e-953a-9b9898b8876b',
  'Guest Inviter': '95e79109-95c0-4d8e-aee3-d01accf2d47b',
}

export const HELPDESK_ADMINISTRATOR_TEMPLATE_ID = '729827e3-9c14-49f7-bb1b-9608f156bbb8'

export type PrivilegeTier = 0 | 1 | 2
export type TierRule = 't0_fixed' | 't2_reader' | 'default_t1' | 'custom_default' | 'excluded'

export type DirectoryRoleClassification = {
  privilege_tier: PrivilegeTier | null
  tier_rule: TierRule
  is_privileged: boolean
  tier_map_version: string
}

const TIER_0_BY_TEMPLATE = new Map(Object.values(TIER_0_TEMPLATE_IDS).map((id) => [id.toLowerCase(), true] as const))
const TIER_0_BY_NAME = new Set<string>(TIER_0_DIRECTORY_ROLES)
const TIER_2_BY_TEMPLATE = new Map(Object.values(TIER_2_FIXED_TEMPLATE_IDS).map((id) => [id.toLowerCase(), true] as const))
const TIER_2_BY_NAME = new Set<string>(TIER_2_FIXED_DIRECTORY_ROLES)
const EXCLUDED_BY_TEMPLATE = new Map(Object.values(EXCLUDED_TEMPLATE_IDS).map((id) => [id.toLowerCase(), true] as const))
const EXCLUDED_BY_NAME = new Set<string>(TIER_1_EXCLUDED_DIRECTORY_ROLES)

export function classifyDirectoryRole(input: {
  templateId?: string | null
  displayName?: string | null
  isBuiltIn?: boolean | null
}): DirectoryRoleClassification {
  const template = (input.templateId ?? '').trim().toLowerCase()
  const name = (input.displayName ?? '').trim()
  const builtIn = input.isBuiltIn !== false

  if ((template && TIER_0_BY_TEMPLATE.has(template)) || TIER_0_BY_NAME.has(name)) {
    return { privilege_tier: 0, tier_rule: 't0_fixed', is_privileged: true, tier_map_version: TIER_MAP_VERSION }
  }
  if ((template && EXCLUDED_BY_TEMPLATE.has(template)) || EXCLUDED_BY_NAME.has(name)) {
    return { privilege_tier: null, tier_rule: 'excluded', is_privileged: false, tier_map_version: TIER_MAP_VERSION }
  }
  if (builtIn === false) {
    return { privilege_tier: 1, tier_rule: 'custom_default', is_privileged: true, tier_map_version: TIER_MAP_VERSION }
  }
  if ((template && TIER_2_BY_TEMPLATE.has(template)) || TIER_2_BY_NAME.has(name) || name.endsWith(' Reader')) {
    return { privilege_tier: 2, tier_rule: 't2_reader', is_privileged: true, tier_map_version: TIER_MAP_VERSION }
  }
  return { privilege_tier: 1, tier_rule: 'default_t1', is_privileged: true, tier_map_version: TIER_MAP_VERSION }
}
