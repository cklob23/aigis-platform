import 'server-only'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import type { GraphClient } from '@/lib/graph/client'
import {
  fetchGroupEligibilitySchedules,
  fetchRoleAssignments,
  fetchRoleDefinitions,
  fetchRoleEligibilitySchedules,
} from '@/lib/graph/privileged'
import {
  fetchDirectoryRolePrincipalIds,
  fetchManager,
  fetchUsersByIds,
  type GraphInternalUser,
} from '@/lib/graph/queries'
import {
  planInternalInventory,
  type IncomingInternalUser,
  type InternalInventoryPlan,
} from '@/lib/identity/ingest'
import { writeInternalInventory, writePrivilegedInventory } from '@/lib/identity/write-inventory'
import { authMethodsReadsEnabled, groupPimReadsEnabled, pimDirectoryReadsEnabled } from '@/lib/privileged/capability'
import { AUTH_METHOD_BATCH_SIZE, chunkAuthMethodRequests, parseAuthMethodTypes } from '@/lib/risk/auth-methods'
import { mustWrite } from '@/lib/supabase/write'
import { mapPimMemberType, planPrivilegedInventory, scheduleBounds } from '@/lib/privileged/ingest'
import { fetchAllById } from '@/lib/supabase/page'

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function asIncoming(user: GraphInternalUser, flags: { is_role_holder?: boolean; is_sponsor?: boolean; is_manager?: boolean }): IncomingInternalUser {
  return {
    ms_object_id: user.id,
    display_name: user.displayName ?? null,
    email: user.mail ?? user.userPrincipalName ?? null,
    upn: user.userPrincipalName ?? null,
    account_enabled: user.accountEnabled ?? true,
    user_type: user.userType ?? 'Member',
    on_premises_sync_enabled: user.onPremisesSyncEnabled ?? null,
    assigned_plans: user.assignedPlans ?? [],
    is_role_holder: flags.is_role_holder === true,
    is_sponsor: flags.is_sponsor === true,
    is_manager: flags.is_manager === true,
  }
}

/**
 * Privileged stage: inventory role holders, guest sponsors, and role-holder
 * managers as human_internal, then inventory directory roles, assignments,
 * and PIM eligibility when the PIM capability is available.
 */
export async function runPrivilegedStage(
  jobId: string,
  tenantId: string,
  g: GraphClient,
  settings?: Record<string, unknown> | null,
): Promise<InternalInventoryPlan> {
  const supabase = db()
  const now = new Date().toISOString()
  const pimOn = pimDirectoryReadsEnabled(settings)
  const groupPimOn = groupPimReadsEnabled(settings)

  const guestSponsors = await fetchAllById<{ sponsor_ms_object_id: string | null }>('guest_identities sponsors', () =>
    supabase.from('guest_identities').select('sponsor_ms_object_id').eq('tenant_id', tenantId).is('removed_at', null),
  )

  const sponsorIds = Array.from(
    new Set(guestSponsors.map((row) => row.sponsor_ms_object_id).filter((id): id is string => Boolean(id))),
  )
  const roleHolderIds = await fetchDirectoryRolePrincipalIds(g)
  const eligibility = pimOn ? await fetchRoleEligibilitySchedules(g) : []
  const groupEligibility = groupPimOn ? await fetchGroupEligibilitySchedules(g) : []
  let storedEligiblePrincipals: { principal_ms_object_id: string; principal_identity_id: string | null }[] = []
  if (!pimOn) {
    storedEligiblePrincipals = await fetchAllById('role_assignments eligible principals', () =>
      supabase
        .from('role_assignments')
        .select('principal_ms_object_id,principal_identity_id')
        .eq('tenant_id', tenantId)
        .eq('assignment_type', 'eligible')
        .is('removed_at', null),
    )
  }
  const eligiblePrincipalIds = [
    ...eligibility.map((row) => row.principalId ?? ''),
    ...groupEligibility.map((row) => row.principalId ?? ''),
    ...storedEligiblePrincipals.map((row) => row.principal_ms_object_id),
  ].filter(Boolean)
  const seedIds = Array.from(new Set([...roleHolderIds, ...sponsorIds, ...eligiblePrincipalIds]))
  const users = await fetchUsersByIds(g, seedIds)
  const byId = new Map(users.map((user) => [user.id, user]))
  const roleHolderSet = new Set(roleHolderIds)
  const sponsorSet = new Set(sponsorIds)

  const managerIds: string[] = []
  for (const batch of chunk(roleHolderIds.filter((id) => byId.has(id)), 10)) {
    const found = await Promise.all(batch.map((id) => fetchManager(g, id)))
    for (const manager of found) {
      if (!manager?.id) continue
      managerIds.push(manager.id)
      if (!byId.has(manager.id)) byId.set(manager.id, manager)
    }
  }
  const missingManagers = managerIds.filter((id) => !byId.has(id))
  if (missingManagers.length) {
    for (const user of await fetchUsersByIds(g, missingManagers)) byId.set(user.id, user)
  }
  const managerSet = new Set(managerIds)

  const incoming: IncomingInternalUser[] = []
  for (const user of byId.values()) {
    incoming.push(
      asIncoming(user, {
        is_role_holder: roleHolderSet.has(user.id),
        is_sponsor: sponsorSet.has(user.id),
        is_manager: managerSet.has(user.id),
      }),
    )
  }

  const existingAccounts = await fetchAllById<{
    identity_id: string
    source_object_id: string
    removed_at: string | null
  }>('identity_accounts internals', () =>
    supabase
      .from('identity_accounts')
      .select('identity_id,source_object_id,removed_at')
      .eq('tenant_id', tenantId)
      .eq('source', 'entra')
      .eq('account_kind', 'user'),
  )

  const plan = planInternalInventory({
    tenantId,
    now,
    incoming,
    existing: existingAccounts.map((row) => ({
      identity_id: row.identity_id,
      ms_object_id: row.source_object_id,
      removed_at: row.removed_at,
    })),
  })
  await writeInternalInventory(plan)

  const [definitions, assignments, existingRoles, existingAssignments, existingGroup] = await Promise.all([
    fetchRoleDefinitions(g),
    fetchRoleAssignments(g),
    fetchAllById<{ id: string; ms_role_id: string; removed_at: string | null }>('directory_roles', () =>
      supabase.from('directory_roles').select('id,ms_role_id,removed_at').eq('tenant_id', tenantId),
    ),
    fetchAllById<{
      id: string
      ms_assignment_id: string
      assignment_type: string | null
      directory_role_id: string | null
      principal_ms_object_id: string | null
      directory_scope_id: string | null
      member_type: string | null
      pim_status: string | null
      starts_at: string | null
      ends_at: string | null
      removed_at: string | null
    }>('role_assignments', () =>
      supabase
        .from('role_assignments')
        .select(
          'id,ms_assignment_id,assignment_type,directory_role_id,principal_ms_object_id,directory_scope_id,member_type,pim_status,starts_at,ends_at,removed_at',
        )
        .eq('tenant_id', tenantId),
    ),
    fetchAllById<{ id: string; ms_schedule_id: string; removed_at: string | null }>('group_pim_eligibilities', () =>
      supabase.from('group_pim_eligibilities').select('id,ms_schedule_id,removed_at').eq('tenant_id', tenantId),
    ),
  ])
  const principalByMsObjectId = new Map(plan.accounts.map((account) => [account.source_object_id, account.identity_id]))
  for (const row of storedEligiblePrincipals) {
    if (row.principal_ms_object_id && row.principal_identity_id && !principalByMsObjectId.has(row.principal_ms_object_id)) {
      principalByMsObjectId.set(row.principal_ms_object_id, row.principal_identity_id)
    }
  }
  const extraInternalIds = storedEligiblePrincipals
    .map((row) => row.principal_identity_id)
    .filter((id): id is string => Boolean(id))
  const roleMsById = new Map(existingRoles.map((row) => [row.id, row.ms_role_id]))
  const preservedEligible = pimOn
    ? []
    : existingAssignments
        .filter((row) => row.assignment_type === 'eligible' && !row.removed_at)
        .map((row) => ({
          ms_assignment_id: row.ms_assignment_id,
          ms_role_id: (row.directory_role_id && roleMsById.get(row.directory_role_id)) || '',
          principal_ms_object_id: row.principal_ms_object_id ?? '',
          directory_scope_id: row.directory_scope_id ?? '/',
          assignment_type: 'eligible' as const,
          member_type: mapPimMemberType(row.member_type),
          pim_status: row.pim_status,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
        }))
  const incomingAssignments = [
    ...assignments.map((row) => ({
      ms_assignment_id: row.id,
      ms_role_id: row.roleDefinitionId ?? '',
      principal_ms_object_id: row.principalId ?? '',
      directory_scope_id: row.directoryScopeId ?? '/',
      assignment_type: 'active' as const,
    })),
    ...(pimOn
      ? eligibility.map((row) => {
          const bounds = scheduleBounds(row.scheduleInfo)
          return {
            ms_assignment_id: row.id,
            ms_role_id: row.roleDefinitionId ?? '',
            principal_ms_object_id: row.principalId ?? '',
            directory_scope_id: row.directoryScopeId ?? '/',
            assignment_type: 'eligible' as const,
            member_type: mapPimMemberType(row.memberType),
            pim_status: row.status ?? null,
            starts_at: bounds.starts_at,
            ends_at: bounds.ends_at,
          }
        })
      : preservedEligible),
  ]
  const existingForReconcile = pimOn
    ? existingAssignments
    : existingAssignments.filter((row) => row.assignment_type !== 'eligible')
  const rolePlan = planPrivilegedInventory({
    tenantId,
    now,
    definitions: definitions.map((row) => ({
      ms_role_id: row.id,
      template_id: row.templateId ?? null,
      display_name: row.displayName ?? row.id,
      description: row.description ?? null,
      is_built_in: row.isBuiltIn,
      ms_is_privileged: row.isPrivileged,
    })),
    assignments: incomingAssignments,
    existingRoles,
    existingAssignments: existingForReconcile,
    principalByMsObjectId,
    internalIdentityIds: Array.from(new Set([...plan.identities.map((identity) => identity.id), ...extraInternalIds])),
    groupEligibilities: groupPimOn
      ? groupEligibility.map((row) => {
          const bounds = scheduleBounds(row.scheduleInfo)
          return {
            ms_schedule_id: row.id,
            group_ms_object_id: row.groupId ?? '',
            principal_ms_object_id: row.principalId ?? '',
            access_id: row.accessId,
            member_type: row.memberType,
            pim_status: row.status ?? null,
            starts_at: bounds.starts_at,
            ends_at: bounds.ends_at,
          }
        })
      : [],
    existingGroupEligibilities: groupPimOn
      ? existingGroup
      : [],
    pim: pimOn ? 'available' : 'skipped',
    pimGroups: groupPimOn ? 'available' : 'skipped',
  })
  await writePrivilegedInventory(rolePlan)
  if (authMethodsReadsEnabled(settings)) {
    await persistRoleHolderAuthMethods(g, tenantId, rolePlan.identityPatches.filter((row) => row.is_privileged).map((row) => row.id))
  }
  await audit({ tenantId, userId: '', email: 'system' } as never, {
    action: 'privileged.inventory_synced',
    targetType: 'tenant',
    targetId: tenantId,
    newState: rolePlan.auditState,
    correlationId: jobId,
  })
  return plan
}

/** GET-only $batch of 20 for role holders. Skips service principals and groups. */
async function persistRoleHolderAuthMethods(g: GraphClient, tenantId: string, identityIds: string[]) {
  if (identityIds.length === 0) return
  const supabase = db()
  const accounts = await fetchAllById<{
    id: string
    identity_id: string
    source_object_id: string
    account_kind: string
    attrs: Record<string, unknown> | null
  }>('identity_accounts auth methods', () =>
    supabase
      .from('identity_accounts')
      .select('id,identity_id,source_object_id,account_kind,attrs')
      .eq('tenant_id', tenantId)
      .eq('source', 'entra')
      .is('removed_at', null)
      .in('identity_id', identityIds),
  )
  const holders = accounts.filter((row) => row.account_kind === 'user' || row.account_kind === 'guest')
  const byRequestId = new Map<string, (typeof holders)[number]>()
  for (const batch of chunk(holders, AUTH_METHOD_BATCH_SIZE)) {
    const requests = chunkAuthMethodRequests(batch.map((row) => row.source_object_id))[0] ?? []
    requests.forEach((req, i) => byRequestId.set(req.id, batch[i]))
    const results = await g.batch<{ value?: { '@odata.type'?: string }[] }>(requests)
    for (const [id, result] of Object.entries(results)) {
      const account = byRequestId.get(id)
      if (!account) continue
      if (result.status !== 200) continue
      const methods = parseAuthMethodTypes(result.body)
      if (!methods) continue
      const attrs = { ...(account.attrs ?? {}), auth_methods: methods }
      mustWrite(
        'identity_accounts auth_methods',
        await supabase.from('identity_accounts').update({ attrs }).eq('id', account.id).eq('tenant_id', tenantId),
      )
      if (account.account_kind === 'guest') {
        mustWrite(
          'guest_identities auth_methods',
          await supabase.from('guest_identities').update({ auth_methods: methods }).eq('identity_id', account.identity_id).eq('tenant_id', tenantId),
        )
      }
    }
    byRequestId.clear()
  }
}
