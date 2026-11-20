import 'server-only'
import type { GraphClient } from '@/lib/graph/client'

export type GraphRoleDefinition = {
  id: string
  displayName?: string
  description?: string
  isBuiltIn?: boolean
  isPrivileged?: boolean
  templateId?: string
}

export type GraphRoleAssignment = {
  id: string
  principalId?: string
  roleDefinitionId?: string
  directoryScopeId?: string
}

export type GraphScheduleInfo = {
  startDateTime?: string | null
  expiration?: { type?: string | null; endDateTime?: string | null } | null
}

export type GraphRoleEligibilitySchedule = {
  id: string
  principalId?: string
  roleDefinitionId?: string
  directoryScopeId?: string
  memberType?: string
  status?: string
  scheduleInfo?: GraphScheduleInfo | null
}

export type GraphGroupEligibilitySchedule = {
  id: string
  groupId?: string
  principalId?: string
  accessId?: string
  memberType?: string
  status?: string
  scheduleInfo?: GraphScheduleInfo | null
}

const ROLE_DEFINITION_SELECT = 'id,displayName,description,isBuiltIn,isPrivileged,templateId'
const ROLE_ASSIGNMENT_SELECT = 'id,principalId,roleDefinitionId,directoryScopeId'

/** Read-only GET of unified directory role definitions. */
export async function fetchRoleDefinitions(g: GraphClient, onPage?: (n: number) => void): Promise<GraphRoleDefinition[]> {
  return g.getAll<GraphRoleDefinition>(
    `/roleManagement/directory/roleDefinitions?$select=${ROLE_DEFINITION_SELECT}&$top=999`,
    false,
    onPage,
  )
}

/** Read-only GET of unified directory role assignments (active). */
export async function fetchRoleAssignments(g: GraphClient, onPage?: (n: number) => void): Promise<GraphRoleAssignment[]> {
  return g.getAll<GraphRoleAssignment>(
    `/roleManagement/directory/roleAssignments?$select=${ROLE_ASSIGNMENT_SELECT}&$top=999`,
    false,
    onPage,
  )
}

const ROLE_ELIGIBILITY_SELECT = 'id,principalId,roleDefinitionId,directoryScopeId,memberType,status,scheduleInfo'
const GROUP_ELIGIBILITY_SELECT = 'id,groupId,principalId,accessId,memberType,status,scheduleInfo'

/** Read-only GET of directory PIM eligibility schedules. */
export async function fetchRoleEligibilitySchedules(
  g: GraphClient,
  onPage?: (n: number) => void,
): Promise<GraphRoleEligibilitySchedule[]> {
  return g.getAll<GraphRoleEligibilitySchedule>(
    `/roleManagement/directory/roleEligibilitySchedules?$select=${ROLE_ELIGIBILITY_SELECT}&$top=999`,
    false,
    onPage,
  )
}

/** Read-only GET of PIM for Groups eligibility schedules. */
export async function fetchGroupEligibilitySchedules(
  g: GraphClient,
  onPage?: (n: number) => void,
): Promise<GraphGroupEligibilitySchedule[]> {
  return g.getAll<GraphGroupEligibilitySchedule>(
    `/identityGovernance/privilegedAccess/group/eligibilitySchedules?$select=${GROUP_ELIGIBILITY_SELECT}&$top=999`,
    false,
    onPage,
  )
}
