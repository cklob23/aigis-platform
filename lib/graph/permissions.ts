/** Application read permissions declared for admin consent (.default). Never includes ReadWrite. */
export const GRAPH_APPLICATION_READ_PERMISSIONS = [
  'User.Read.All',
  'Group.Read.All',
  'Sites.Read.All',
  'Application.Read.All',
  'AuditLog.Read.All',
  'Organization.Read.All',
  'RoleManagement.Read.Directory',
  'PrivilegedEligibilitySchedule.Read.AzureADGroup',
  'PrivilegedAssignmentSchedule.Read.AzureADGroup',
  'UserAuthenticationMethod.Read.All',
] as const

export const PRIVILEGED_READ_PERMISSIONS = [
  'RoleManagement.Read.Directory',
  'PrivilegedEligibilitySchedule.Read.AzureADGroup',
  'PrivilegedAssignmentSchedule.Read.AzureADGroup',
  'UserAuthenticationMethod.Read.All',
] as const

export type GraphApplicationReadPermission = (typeof GRAPH_APPLICATION_READ_PERMISSIONS)[number]

export const GRAPH_APPLICATION_READ_PERMISSION_DETAILS: Record<
  GraphApplicationReadPermission,
  { purpose: string; type: 'Application' }
> = {
  'User.Read.All': { purpose: 'Enumerate guest users, sign-in activity, sponsors', type: 'Application' },
  'Group.Read.All': { purpose: 'Teams, Microsoft 365 Groups, security groups and their members/owners', type: 'Application' },
  'Sites.Read.All': { purpose: 'SharePoint sites connected to groups', type: 'Application' },
  'Application.Read.All': { purpose: 'Enterprise app assignments held by guests', type: 'Application' },
  'AuditLog.Read.All': { purpose: 'Last interactive / non-interactive sign-in timestamps', type: 'Application' },
  'Organization.Read.All': { purpose: 'Verified domains and tenant name', type: 'Application' },
  'RoleManagement.Read.Directory': { purpose: 'Directory role definitions and PIM eligibility (read)', type: 'Application' },
  'PrivilegedEligibilitySchedule.Read.AzureADGroup': { purpose: 'Group PIM eligibility schedules (read)', type: 'Application' },
  'PrivilegedAssignmentSchedule.Read.AzureADGroup': { purpose: 'Group PIM assignment schedules (read)', type: 'Application' },
  'UserAuthenticationMethod.Read.All': { purpose: 'Authentication methods registered on users (read)', type: 'Application' },
}
