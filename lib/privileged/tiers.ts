/**
 * Directory role display names for PR 4 privileged inventory.
 * Not used by the PR 2 flag or capability probes.
 *
 * Tier 0 is the 12-role list Caleb approved. Tier 1 is every other admin
 * role (including Authentication Admin, Password Admin, and custom roles).
 * Directory Readers and Guest Inviter are excluded from both tiers.
 */
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

export const TIER_1_EXCLUDED_DIRECTORY_ROLES = ['Directory Readers', 'Guest Inviter'] as const
