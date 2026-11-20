import 'server-only'
import { GraphClient, GraphError } from '@/lib/graph/client'

export type GraphAssignedPlan = { servicePlanId?: string; service?: string; capabilityStatus?: string }

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
  assignedPlans?: GraphAssignedPlan[]
  onPremisesSyncEnabled?: boolean | null
}

export type GraphInternalUser = {
  id: string
  displayName?: string
  mail?: string
  userPrincipalName?: string
  userType?: string
  accountEnabled?: boolean
  assignedPlans?: GraphAssignedPlan[]
  onPremisesSyncEnabled?: boolean | null
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

const INTERNAL_USER_SELECT = 'id,displayName,mail,userPrincipalName,userType,accountEnabled,assignedPlans,onPremisesSyncEnabled'

/** Graph `$filter=id in (...)` accepts at most 15 values. */
export const GRAPH_ID_IN_CHUNK = 15

const GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function guidIds(ids: string[]) {
  return Array.from(new Set(ids.filter((id) => GUID_RE.test(id))))
}

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

/** Read-only. Chunked `/users?$filter=id in (...)` so Graph stays under the in-operator limit. */
export async function fetchUsersByIds(g: GraphClient, ids: string[]): Promise<GraphInternalUser[]> {
  const unique = guidIds(ids)
  if (unique.length === 0) return []
  const out: GraphInternalUser[] = []
  for (const batch of chunk(unique, GRAPH_ID_IN_CHUNK)) {
    const filter = batch.map((id) => `'${id}'`).join(',')
    const rows = await g.getAll<GraphInternalUser>(`/users?$filter=id in (${filter})&$select=${INTERNAL_USER_SELECT}&$top=999`)
    out.push(...rows)
  }
  return out
}

/** Read-only GET. 404 means the user has no manager. */
export async function fetchManager(g: GraphClient, userId: string): Promise<GraphInternalUser | null> {
  if (!GUID_RE.test(userId)) return null
  try {
    return await g.get<GraphInternalUser>(`/users/${userId}/manager?$select=${INTERNAL_USER_SELECT}`)
  } catch (err) {
    if (err instanceof GraphError && (err.status === 404 || err.status === 400)) return null
    throw err
  }
}

/** Active directory role assignment principal IDs. GET only. */
export async function fetchDirectoryRolePrincipalIds(g: GraphClient): Promise<string[]> {
  const assignments = await g.getAll<{ principalId?: string }>(
    '/roleManagement/directory/roleAssignments?$select=principalId&$top=999',
  )
  return guidIds(assignments.map((row) => row.principalId ?? ''))
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

export type GraphSubscribedSku = { skuPartNumber?: string; skuId?: string; capabilityStatus?: string }

export async function fetchSubscribedSkus(g: GraphClient) {
  const res = await g.get<{ value: GraphSubscribedSku[] }>('/subscribedSkus?$select=skuPartNumber,skuId,capabilityStatus')
  return res.value
}

export async function fetchRoleAssignableGroupId(g: GraphClient): Promise<string | null> {
  try {
    const res = await g.get<{ value: { id: string }[] }>(
      '/groups?$filter=isAssignableToRole eq true&$count=true&$select=id&$top=1',
    )
    return res.value[0]?.id ?? null
  } catch {
    return null
  }
}

/** Read-only status probe. Never POST/PATCH/DELETE. */
export async function probeGraphGet(g: GraphClient, path: string): Promise<{ status: number }> {
  try {
    await g.get(path)
    return { status: 200 }
  } catch (err) {
    if (err instanceof GraphError) return { status: err.status }
    throw err
  }
}

export async function probeSignInActivity(g: GraphClient): Promise<boolean> {
  try {
    await g.get('/users?$top=1&$select=id,signInActivity')
    return true
  } catch (err) {
    if (err instanceof GraphError && (err.status === 403 || err.code === 'Authentication_RequestFromNonPremiumTenantOrB2CTenant')) {
      return false
    }
    throw err
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
  /** 403 means the permission is missing. Other 4xx still mean Graph accepted the app token for this resource. */
  const probeRead = async (name: string, path: string) => {
    try {
      await g.get(path)
      checks.push({ name, ok: true })
    } catch (err) {
      if (err instanceof GraphError && err.status !== 401 && err.status !== 403 && err.status >= 400 && err.status < 500) {
        checks.push({ name, ok: true, detail: 'permission present' })
        return
      }
      checks.push({ name, ok: false, detail: err instanceof Error ? err.message : 'failed' })
    }
  }
  await probe('Organization.Read.All', '/organization?$select=id')
  await probe('User.Read.All', "/users?$top=1&$filter=userType eq 'Guest'&$select=id")
  await probe('Group.Read.All', '/groups?$top=1&$select=id')
  await probe('Application.Read.All', '/servicePrincipals?$top=1&$select=id')
  await probe('AuditLog.Read.All', '/users?$top=1&$select=id,signInActivity')
  await probe('Sites.Read.All', '/sites/root?$select=id')
  await probeRead('RoleManagement.Read.Directory', '/roleManagement/directory/roleEligibilitySchedules?$top=1')
  await probeRead('PrivilegedEligibilitySchedule.Read.AzureADGroup', '/identityGovernance/privilegedAccess/group/eligibilitySchedules?$top=1')
  await probeRead('PrivilegedAssignmentSchedule.Read.AzureADGroup', '/identityGovernance/privilegedAccess/group/assignmentSchedules?$top=1')
  try {
    const first = await g.get<{ value: { id: string }[] }>('/users?$top=1&$select=id')
    const userId = first.value[0]?.id
    if (!userId) {
      checks.push({ name: 'UserAuthenticationMethod.Read.All', ok: false, detail: 'no users to probe' })
    } else {
      await probe('UserAuthenticationMethod.Read.All', `/users/${userId}/authentication/methods`)
    }
  } catch (err) {
    checks.push({ name: 'UserAuthenticationMethod.Read.All', ok: false, detail: err instanceof Error ? err.message : 'failed' })
  }
  return checks
}
