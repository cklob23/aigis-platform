import 'server-only'
import { GraphClient, GraphError } from '@/lib/graph/client'

export type GraphUser = {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  userType?: string
  accountEnabled?: boolean
  createdDateTime?: string
  externalUserState?: string
  companyName?: string
  jobTitle?: string
  creationType?: string
  signInActivity?: { lastSignInDateTime?: string; lastNonInteractiveSignInDateTime?: string }
  sponsors?: { id: string; displayName?: string; mail?: string; accountEnabled?: boolean }[]
}

export type GraphGroup = {
  id: string
  displayName: string
  description?: string
  mail?: string
  visibility?: string
  groupTypes?: string[]
  resourceProvisioningOptions?: string[]
  securityEnabled?: boolean
  mailEnabled?: boolean
}

export type GraphSite = { id: string; displayName?: string; name?: string; webUrl?: string; description?: string }
export type GraphServicePrincipal = { id: string; displayName: string; appId: string; homepage?: string; tags?: string[] }
export type GraphOrganization = {
  id: string
  displayName: string
  verifiedDomains: { name: string; isDefault?: boolean; isInitial?: boolean }[]
}

const USER_SELECT =
  'id,displayName,mail,userPrincipalName,userType,accountEnabled,createdDateTime,externalUserState,companyName,jobTitle,creationType,signInActivity'

export async function fetchOrganization(g: GraphClient) {
  const res = await g.get<{ value: GraphOrganization[] }>('/organization?$select=id,displayName,verifiedDomains')
  return res.value[0]
}

export async function fetchGuests(g: GraphClient, onProgress?: (n: number) => void) {
  try {
    return await g.getAll<GraphUser>(`/users?$filter=userType eq 'Guest'&$select=${USER_SELECT}&$expand=sponsors($select=id,displayName,mail,accountEnabled)&$top=999`, false, onProgress)
  } catch (err) {
    // signInActivity requires AuditLog.Read.All; degrade gracefully without it.
    if (err instanceof GraphError && (err.status === 403 || err.code === 'Authentication_RequestFromNonPremiumTenantOrB2CTenant')) {
      const select = USER_SELECT.replace(',signInActivity', '')
      return g.getAll<GraphUser>(`/users?$filter=userType eq 'Guest'&$select=${select}&$expand=sponsors($select=id,displayName,mail,accountEnabled)&$top=999`, false, onProgress)
    }
    throw err
  }
}

export async function fetchGroups(g: GraphClient, onProgress?: (n: number) => void) {
  return g.getAll<GraphGroup>(
    '/groups?$select=id,displayName,description,mail,visibility,groupTypes,resourceProvisioningOptions,securityEnabled,mailEnabled&$top=999',
    false,
    onProgress,
  )
}

export async function fetchGroupMembers(g: GraphClient, groupId: string) {
  return g.getAll<{ id: string; userType?: string; '@odata.type'?: string }>(`/groups/${groupId}/members?$select=id,userType&$top=999`)
}

export async function fetchGroupOwners(g: GraphClient, groupId: string) {
  return g.getAll<{ id: string; displayName?: string; mail?: string; userType?: string }>(`/groups/${groupId}/owners?$select=id,displayName,mail,userType&$top=999`)
}

export async function fetchGroupSite(g: GraphClient, groupId: string) {
  try {
    return await g.get<GraphSite>(`/groups/${groupId}/sites/root?$select=id,displayName,name,webUrl,description`)
  } catch {
    return null
  }
}

export async function fetchSites(g: GraphClient) {
  try {
    return await g.getAll<GraphSite>('/sites?search=*&$select=id,displayName,name,webUrl,description')
  } catch {
    return []
  }
}

export async function fetchEnterpriseApps(g: GraphClient) {
  return g.getAll<GraphServicePrincipal>(`/servicePrincipals?$filter=tags/any(t:t eq 'WindowsAzureActiveDirectoryIntegratedApp')&$select=id,displayName,appId,homepage,tags&$top=999`)
}

export async function fetchAppAssignments(g: GraphClient, spId: string) {
  return g.getAll<{ principalId: string; principalType: string; principalDisplayName?: string }>(`/servicePrincipals/${spId}/appRoleAssignedTo?$top=999`)
}

export async function fetchAuthMethods(g: GraphClient, userId: string) {
  try {
    const res = await g.get<{ value: { '@odata.type': string }[] }>(`/users/${userId}/authentication/methods`)
    return res.value.map((m) => m['@odata.type'].replace('#microsoft.graph.', ''))
  } catch {
    return []
  }
}

export async function removeGroupMember(g: GraphClient, groupId: string, userId: string) {
  return g.delete(`/groups/${groupId}/members/${userId}/$ref`)
}

export async function removeGroupOwner(g: GraphClient, groupId: string, userId: string) {
  return g.delete(`/groups/${groupId}/owners/${userId}/$ref`)
}

export async function setAccountEnabled(g: GraphClient, userId: string, enabled: boolean) {
  return g.patch(`/users/${userId}`, { accountEnabled: enabled })
}

export async function deleteUser(g: GraphClient, userId: string) {
  return g.delete(`/users/${userId}`)
}

export async function revokeSessions(g: GraphClient, userId: string) {
  return g.post(`/users/${userId}/revokeSignInSessions`, {})
}

/** Verifies the app-only permissions actually granted via admin consent. */
export async function verifyPermissions(g: GraphClient) {
  const checks: { name: string; ok: boolean; detail?: string }[] = []
  const probe = async (name: string, path: string) => {
    try {
      await g.get(path)
      checks.push({ name, ok: true })
    } catch (err) {
      checks.push({ name, ok: false, detail: err instanceof Error ? err.message : 'failed' })
    }
  }
  await probe('Organization.Read.All', '/organization?$select=id')
  await probe('User.Read.All', "/users?$top=1&$filter=userType eq 'Guest'&$select=id")
  await probe('Group.Read.All', '/groups?$top=1&$select=id')
  await probe('Application.Read.All', '/servicePrincipals?$top=1&$select=id')
  await probe('AuditLog.Read.All', '/users?$top=1&$select=id,signInActivity')
  await probe('Sites.Read.All', '/sites/root?$select=id')
  return checks
}
