/** Read-only Microsoft Entra admin center deep links. These are browser URLs, not Graph calls. */

export function entraAssignedRolesUrl(objectId: string) {
  return `https://entra.microsoft.com/#view/Microsoft_AAD_UsersAndTenants/UserProfileMenuBlade/~/AssignedRoles/userId/${encodeURIComponent(objectId)}`
}

export function entraRoleDefinitionUrl(roleTemplateId: string) {
  return `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/RoleMenuBlade/~/Overview/roleId/${encodeURIComponent(roleTemplateId)}`
}

export function entraPimRolesUrl() {
  return 'https://entra.microsoft.com/#view/Microsoft_Azure_PIMCommon/ActivationMenuBlade/~/aadmigratedroles'
}

export function entraServicePrincipalUrl(objectId: string) {
  return `https://entra.microsoft.com/#view/Microsoft_AAD_IAM/ManagedAppMenuBlade/~/Users/objectId/${encodeURIComponent(objectId)}`
}

export function entraIdentityUrl(input: { objectId: string; identityClass: string }) {
  if (input.identityClass === 'non_human') return entraServicePrincipalUrl(input.objectId)
  return entraAssignedRolesUrl(input.objectId)
}
