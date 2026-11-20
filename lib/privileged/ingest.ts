import { classifyDirectoryRole, TIER_MAP_VERSION, type PrivilegeTier, type TierRule } from '@/lib/privileged/tiers'

export type IncomingRoleDefinition = {
  ms_role_id: string
  template_id?: string | null
  display_name: string
  description?: string | null
  is_built_in?: boolean | null
  ms_is_privileged?: boolean | null
}

export type IncomingRoleAssignment = {
  ms_assignment_id: string
  ms_role_id: string
  principal_ms_object_id: string
  directory_scope_id?: string | null
  assignment_type?: 'active' | 'eligible'
  member_type?: 'direct' | 'group' | 'inherited' | null
  pim_status?: string | null
  starts_at?: string | null
  ends_at?: string | null
}

export type ExistingDirectoryRole = {
  id: string
  ms_role_id: string
  removed_at: string | null
}

export type ExistingRoleAssignment = {
  id: string
  ms_assignment_id: string
  removed_at: string | null
}

export type DirectoryRoleRow = {
  id: string
  tenant_id: string
  ms_role_id: string
  template_id: string | null
  display_name: string
  description: string | null
  is_built_in: boolean
  ms_is_privileged: boolean
  is_privileged: boolean
  privilege_tier: PrivilegeTier | null
  tier_rule: TierRule
  tier_map_version: string
  last_seen_at: string
  removed_at: string | null
}

export type RoleAssignmentRow = {
  id: string
  tenant_id: string
  ms_assignment_id: string
  directory_role_id: string
  principal_identity_id: string | null
  principal_ms_object_id: string
  directory_scope_id: string
  assignment_type: 'active' | 'eligible'
  member_type: 'direct' | 'group' | 'inherited'
  pim_status: string | null
  starts_at: string | null
  ends_at: string | null
  last_seen_at: string
  removed_at: string | null
}

export type IncomingGroupPimEligibility = {
  ms_schedule_id: string
  group_ms_object_id: string
  principal_ms_object_id: string
  access_id?: string | null
  member_type?: string | null
  pim_status?: string | null
  starts_at?: string | null
  ends_at?: string | null
}

export type ExistingGroupPimEligibility = {
  id: string
  ms_schedule_id: string
  removed_at: string | null
}

export type GroupPimEligibilityRow = {
  id: string
  tenant_id: string
  ms_schedule_id: string
  group_ms_object_id: string
  principal_identity_id: string | null
  principal_ms_object_id: string
  access_id: 'member' | 'owner'
  member_type: 'direct' | 'group' | 'inherited'
  pim_status: string | null
  starts_at: string | null
  ends_at: string | null
  last_seen_at: string
  removed_at: string | null
}

export type IdentityPrivilegePatch = {
  id: string
  is_privileged: boolean
  privilege_tier: PrivilegeTier | null
}

export type PrivilegedInventoryAuditState = {
  roles: number
  assignments: number
  eligible_assignments: number
  group_eligibilities: number
  privileged_identities: number
  tier_map_version: string
  by_tier: { t0: number; t1: number; t2: number; excluded: number }
  pim: 'available' | 'skipped'
  pim_groups: 'available' | 'skipped'
}

export type PrivilegedInventoryPlan = {
  tenantId: string
  now: string
  roles: DirectoryRoleRow[]
  assignments: RoleAssignmentRow[]
  groupEligibilities: GroupPimEligibilityRow[]
  identityPatches: IdentityPrivilegePatch[]
  removedRoleIds: string[]
  removedAssignmentIds: string[]
  removedGroupEligibilityIds: string[]
  auditState: PrivilegedInventoryAuditState
}

export function mapPimMemberType(value: string | null | undefined): 'direct' | 'group' | 'inherited' {
  const n = (value ?? '').trim().toLowerCase()
  if (n === 'group') return 'group'
  if (n === 'inherited') return 'inherited'
  return 'direct'
}

export function mapGroupAccessId(value: string | null | undefined): 'member' | 'owner' {
  return (value ?? '').trim().toLowerCase() === 'owner' ? 'owner' : 'member'
}

export function scheduleBounds(info: { startDateTime?: string | null; expiration?: { type?: string | null; endDateTime?: string | null } | null } | null | undefined): {
  starts_at: string | null
  ends_at: string | null
} {
  const starts_at = info?.startDateTime ?? null
  const exp = info?.expiration
  if (!exp || exp.type === 'noExpiration') return { starts_at, ends_at: null }
  return { starts_at, ends_at: exp.endDateTime ?? null }
}

function highestTier(current: PrivilegeTier | null, next: PrivilegeTier): PrivilegeTier {
  if (current == null) return next
  return next < current ? next : current
}

/**
 * Plan directory role + assignment inventory. Tiers come from classifyDirectoryRole;
 * Graph isPrivileged is stored and ignored for tier.
 */
export function planPrivilegedInventory(input: {
  tenantId: string
  now: string
  definitions: IncomingRoleDefinition[]
  assignments: IncomingRoleAssignment[]
  existingRoles: ExistingDirectoryRole[]
  existingAssignments: ExistingRoleAssignment[]
  principalByMsObjectId: Map<string, string>
  internalIdentityIds?: string[]
  groupEligibilities?: IncomingGroupPimEligibility[]
  existingGroupEligibilities?: ExistingGroupPimEligibility[]
  pim?: 'available' | 'skipped'
  pimGroups?: 'available' | 'skipped'
  generateId?: () => string
}): PrivilegedInventoryPlan {
  const generateId = input.generateId ?? (() => crypto.randomUUID())
  const existingRoleByMs = new Map(input.existingRoles.map((row) => [row.ms_role_id, row]))
  const existingAssignmentByMs = new Map(input.existingAssignments.map((row) => [row.ms_assignment_id, row]))
  const incomingRoleIds = new Set<string>()
  const incomingAssignmentIds = new Set<string>()

  const roles: DirectoryRoleRow[] = []
  const roleIdByMs = new Map<string, string>()
  const roleById = new Map<string, DirectoryRoleRow>()

  for (const def of input.definitions) {
    if (!def.ms_role_id) continue
    incomingRoleIds.add(def.ms_role_id)
    const classified = classifyDirectoryRole({
      templateId: def.template_id,
      displayName: def.display_name,
      isBuiltIn: def.is_built_in,
    })
    const existing = existingRoleByMs.get(def.ms_role_id)
    const id = existing?.id ?? generateId()
    const row: DirectoryRoleRow = {
      id,
      tenant_id: input.tenantId,
      ms_role_id: def.ms_role_id,
      template_id: def.template_id ?? null,
      display_name: def.display_name,
      description: def.description ?? null,
      is_built_in: def.is_built_in !== false,
      ms_is_privileged: def.ms_is_privileged === true,
      is_privileged: classified.is_privileged,
      privilege_tier: classified.privilege_tier,
      tier_rule: classified.tier_rule,
      tier_map_version: classified.tier_map_version,
      last_seen_at: input.now,
      removed_at: null,
    }
    roles.push(row)
    roleIdByMs.set(def.ms_role_id, id)
    roleById.set(id, row)
  }

  const assignments: RoleAssignmentRow[] = []
  const privilegeByIdentity = new Map<string, PrivilegeTier | null>()
  for (const id of input.internalIdentityIds ?? []) {
    privilegeByIdentity.set(id, null)
  }

  for (const asg of input.assignments) {
    if (!asg.ms_assignment_id || !asg.ms_role_id || !asg.principal_ms_object_id) continue
    const directory_role_id = roleIdByMs.get(asg.ms_role_id)
    if (!directory_role_id) continue
    incomingAssignmentIds.add(asg.ms_assignment_id)
    const existing = existingAssignmentByMs.get(asg.ms_assignment_id)
    const principal_identity_id = input.principalByMsObjectId.get(asg.principal_ms_object_id) ?? null
    const row: RoleAssignmentRow = {
      id: existing?.id ?? generateId(),
      tenant_id: input.tenantId,
      ms_assignment_id: asg.ms_assignment_id,
      directory_role_id,
      principal_identity_id,
      principal_ms_object_id: asg.principal_ms_object_id,
      directory_scope_id: asg.directory_scope_id || '/',
      assignment_type: asg.assignment_type === 'eligible' ? 'eligible' : 'active',
      member_type: mapPimMemberType(asg.member_type),
      pim_status: asg.pim_status ?? null,
      starts_at: asg.starts_at ?? null,
      ends_at: asg.ends_at ?? null,
      last_seen_at: input.now,
      removed_at: null,
    }
    assignments.push(row)
    const role = roleById.get(directory_role_id)
    if (principal_identity_id && role?.is_privileged && role.privilege_tier != null) {
      privilegeByIdentity.set(principal_identity_id, highestTier(privilegeByIdentity.get(principal_identity_id) ?? null, role.privilege_tier))
    }
  }

  const identityPatches: IdentityPrivilegePatch[] = Array.from(privilegeByIdentity.entries()).map(([id, tier]) => ({
    id,
    is_privileged: tier != null,
    privilege_tier: tier,
  }))

  const by_tier = { t0: 0, t1: 0, t2: 0, excluded: 0 }
  for (const role of roles) {
    if (role.tier_rule === 'excluded') by_tier.excluded++
    else if (role.privilege_tier === 0) by_tier.t0++
    else if (role.privilege_tier === 1) by_tier.t1++
    else if (role.privilege_tier === 2) by_tier.t2++
  }

  const incomingGroupIds = new Set<string>()
  const existingGroupByMs = new Map((input.existingGroupEligibilities ?? []).map((row) => [row.ms_schedule_id, row]))
  const groupEligibilities: GroupPimEligibilityRow[] = []
  for (const row of input.groupEligibilities ?? []) {
    if (!row.ms_schedule_id || !row.group_ms_object_id || !row.principal_ms_object_id) continue
    incomingGroupIds.add(row.ms_schedule_id)
    const existing = existingGroupByMs.get(row.ms_schedule_id)
    groupEligibilities.push({
      id: existing?.id ?? generateId(),
      tenant_id: input.tenantId,
      ms_schedule_id: row.ms_schedule_id,
      group_ms_object_id: row.group_ms_object_id,
      principal_identity_id: input.principalByMsObjectId.get(row.principal_ms_object_id) ?? null,
      principal_ms_object_id: row.principal_ms_object_id,
      access_id: mapGroupAccessId(row.access_id),
      member_type: mapPimMemberType(row.member_type),
      pim_status: row.pim_status ?? null,
      starts_at: row.starts_at ?? null,
      ends_at: row.ends_at ?? null,
      last_seen_at: input.now,
      removed_at: null,
    })
  }

  return {
    tenantId: input.tenantId,
    now: input.now,
    roles,
    assignments,
    groupEligibilities,
    identityPatches,
    removedRoleIds: input.existingRoles.filter((row) => !row.removed_at && !incomingRoleIds.has(row.ms_role_id)).map((row) => row.id),
    removedAssignmentIds: input.existingAssignments
      .filter((row) => !row.removed_at && !incomingAssignmentIds.has(row.ms_assignment_id))
      .map((row) => row.id),
    removedGroupEligibilityIds: (input.existingGroupEligibilities ?? [])
      .filter((row) => !row.removed_at && !incomingGroupIds.has(row.ms_schedule_id))
      .map((row) => row.id),
    auditState: {
      roles: roles.length,
      assignments: assignments.length,
      eligible_assignments: assignments.filter((row) => row.assignment_type === 'eligible').length,
      group_eligibilities: groupEligibilities.length,
      privileged_identities: identityPatches.filter((row) => row.is_privileged).length,
      tier_map_version: TIER_MAP_VERSION,
      by_tier,
      pim: input.pim === 'available' ? 'available' : 'skipped',
      pim_groups: input.pimGroups === 'available' ? 'available' : 'skipped',
    },
  }
}
