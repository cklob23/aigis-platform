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
