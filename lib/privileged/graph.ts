import 'server-only'
import { getAppOnlyRoles } from '@/lib/auth/microsoft'
import { GraphClient } from '@/lib/graph/client'
import {
  fetchRoleAssignableGroupId,
  fetchSubscribedSkus,
  probeGraphGet,
  probeSignInActivity,
} from '@/lib/graph/queries'
import type { PrivilegedDeps } from '@/lib/privileged/capability'

/** Live Graph probes. Every call is GET. */
export function livePrivilegedDeps(msTenantId: string): PrivilegedDeps {
  const g = new GraphClient(msTenantId)
  return {
    getRoles: (id, fresh) => getAppOnlyRoles(id, fresh),
    listSkus: () => fetchSubscribedSkus(g),
    probeDirectoryPim: () => probeGraphGet(g, '/roleManagement/directory/roleEligibilitySchedules?$top=1'),
    findRoleAssignableGroupId: () => fetchRoleAssignableGroupId(g),
    probeGroupPim: (groupId) => {
      if (!/^[0-9a-fA-F-]{36}$/.test(groupId)) {
        return Promise.resolve({ status: 400 })
      }
      return probeGraphGet(
        g,
        `/identityGovernance/privilegedAccess/group/eligibilitySchedules?$filter=groupId eq '${groupId}'&$top=1`,
      )
    },
    probeSignInActivity: () => probeSignInActivity(g),
  }
}
