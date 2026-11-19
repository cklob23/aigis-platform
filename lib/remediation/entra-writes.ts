export type RemediationType = 'remove_from_resources' | 'disable_guest' | 'remove_all_access' | 'delete_guest'

/** Application permissions the consent screen and onboarding list today. Admin consent uses `.default`. */
export const REQUESTED_APPLICATION_PERMISSIONS = [
  'User.Read.All',
  'Group.Read.All',
  'Sites.Read.All',
  'Application.Read.All',
  'AuditLog.Read.All',
  'Organization.Read.All',
] as const

/**
 * Graph application permissions each enforce-mode action would need.
 * None of these are requested at consent. Confirmed from lib/graph/queries.ts
 * write helpers used by remediateGuest.
 */
export const GRAPH_WRITE_PERMISSIONS: Record<RemediationType, readonly string[]> = {
  remove_from_resources: ['GroupMember.ReadWrite.All'],
  disable_guest: ['User.ReadWrite.All'],
  remove_all_access: ['GroupMember.ReadWrite.All', 'User.ReadWrite.All'],
  delete_guest: ['User.ReadWrite.All'],
}

export const LIVE_ENTRA_WRITES_DISABLED =
  'AIGIS does not request Graph write permissions. Remediation is recorded here; make the change in Microsoft 365 and confirm it on the next scan.'

export function canExecuteEntraWrites(tenant: { is_demo: boolean }): boolean {
  return tenant.is_demo
}
