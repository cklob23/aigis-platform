import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { GraphClient } from '@/lib/graph/client'
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
import { writeInternalInventory } from '@/lib/identity/write-inventory'

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
 * Users part of the privileged stage: inventory role holders, guest sponsors,
 * and role-holder managers as human_internal. Does not inventory roles.
 */
export async function runPrivilegedStage(jobId: string, tenantId: string, g: GraphClient): Promise<InternalInventoryPlan> {
  void jobId
  const supabase = db()
  const now = new Date().toISOString()

  const { data: guestSponsors } = await supabase
    .from('guest_identities')
    .select('sponsor_ms_object_id')
    .eq('tenant_id', tenantId)
    .is('removed_at', null)

  const sponsorIds = Array.from(
    new Set((guestSponsors ?? []).map((row) => row.sponsor_ms_object_id as string | null).filter((id): id is string => Boolean(id))),
  )
  const roleHolderIds = await fetchDirectoryRolePrincipalIds(g)
  const seedIds = Array.from(new Set([...roleHolderIds, ...sponsorIds]))
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

  const { data: existingAccounts } = await supabase
    .from('identity_accounts')
    .select('identity_id,source_object_id,removed_at')
    .eq('tenant_id', tenantId)
    .eq('source', 'entra')
    .eq('account_kind', 'user')

  const plan = planInternalInventory({
    tenantId,
    now,
    incoming,
    existing: (existingAccounts ?? []).map((row) => ({
      identity_id: row.identity_id as string,
      ms_object_id: row.source_object_id as string,
      removed_at: (row.removed_at as string | null) ?? null,
    })),
  })
  await writeInternalInventory(plan)
  return plan
}
