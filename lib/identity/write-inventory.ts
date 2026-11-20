import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { GuestInventoryPlan, InternalInventoryPlan } from '@/lib/identity/ingest'
import type { PrivilegedInventoryPlan } from '@/lib/privileged/ingest'
import { mustWrite } from '@/lib/supabase/write'

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Persist a dual-write inventory plan. Memberships keep using guest_id.
 * The 0004 provision trigger is not dropped; every guest row here already has identity_id.
 */
export async function writeGuestInventory(plan: GuestInventoryPlan) {
  const supabase = db()
  const tenantId = plan.tenantId

  for (const batch of chunk(plan.identities, 500)) {
    mustWrite('identities upsert', await supabase.from('identities').upsert(batch, { onConflict: 'id' }))
  }
  for (const batch of chunk(plan.accounts, 500)) {
    mustWrite(
      'identity_accounts upsert',
      await supabase.from('identity_accounts').upsert(batch, { onConflict: 'tenant_id,source,source_object_id' }),
    )
  }
  for (const batch of chunk(plan.guests, 500)) {
    mustWrite('guest_identities upsert', await supabase.from('guest_identities').upsert(batch, { onConflict: 'tenant_id,ms_object_id' }))
  }

  if (plan.removedGuestIds.length) {
    mustWrite(
      'guest_identities soft-remove',
      await supabase.from('guest_identities').update({ removed_at: plan.now }).eq('tenant_id', tenantId).in('id', plan.removedGuestIds),
    )
  }
  if (plan.removedIdentityIds.length) {
    mustWrite(
      'identities soft-remove',
      await supabase
        .from('identities')
        .update({ removed_at: plan.now, status: 'removed', last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .in('id', plan.removedIdentityIds),
    )
    mustWrite(
      'identity_accounts soft-remove',
      await supabase
        .from('identity_accounts')
        .update({ removed_at: plan.now, last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .eq('source', 'entra')
        .in('identity_id', plan.removedIdentityIds),
    )
  }

  const fromIds = Array.from(new Set([...plan.guests.map((guest) => guest.identity_id), ...plan.removedIdentityIds]))
  for (const batch of chunk(fromIds, 500)) {
    if (!batch.length) continue
    mustWrite(
      'identity_relations clear sponsors',
      await supabase.from('identity_relations').delete().eq('tenant_id', tenantId).eq('relation_type', 'sponsors').in('from_identity_id', batch),
    )
  }
  for (const batch of chunk(plan.relations, 500)) {
    if (!batch.length) continue
    mustWrite(
      'identity_relations upsert',
      await supabase.from('identity_relations').upsert(batch, { onConflict: 'tenant_id,from_identity_id,to_identity_id,relation_type' }),
    )
  }

  const counts = await assertExternalInventory(supabase, tenantId)
  return counts
}

async function assertExternalInventory(supabase: ReturnType<typeof db>, tenantId: string) {
  const [{ count: guestCount }, { count: identityCount }, { count: accountCount }, { count: nullIds }] = await Promise.all([
    supabase.from('guest_identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('identity_class', 'external'),
    supabase
      .from('identity_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source', 'entra')
      .eq('account_kind', 'guest'),
    supabase.from('guest_identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('identity_id', null),
  ])
  if ((nullIds ?? 0) !== 0) {
    throw new Error(`fail closed: ${nullIds} guest_identities rows have null identity_id`)
  }
  if ((guestCount ?? 0) !== (identityCount ?? 0) || (guestCount ?? 0) !== (accountCount ?? 0)) {
    throw new Error(`fail closed: inventory counts drifted guests=${guestCount} identities=${identityCount} accounts=${accountCount}`)
  }
  return { guestCount: guestCount ?? 0, identityCount: identityCount ?? 0, accountCount: accountCount ?? 0 }
}

/**
 * Persist scoped human_internal users. Does not touch guest_identities.
 * identities_legacy_view stays guest-projected, so its count is unchanged.
 */
export async function writeInternalInventory(plan: InternalInventoryPlan) {
  const supabase = db()
  const tenantId = plan.tenantId

  for (const batch of chunk(plan.identities, 500)) {
    mustWrite('identities upsert internals', await supabase.from('identities').upsert(batch, { onConflict: 'id' }))
  }
  for (const batch of chunk(plan.accounts, 500)) {
    mustWrite(
      'identity_accounts upsert internals',
      await supabase.from('identity_accounts').upsert(batch, { onConflict: 'tenant_id,source,source_object_id' }),
    )
  }

  if (plan.removedIdentityIds.length) {
    mustWrite(
      'identities soft-remove internals',
      await supabase
        .from('identities')
        .update({ removed_at: plan.now, status: 'removed', last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .eq('identity_class', 'human_internal')
        .in('id', plan.removedIdentityIds),
    )
    mustWrite(
      'identity_accounts soft-remove internals',
      await supabase
        .from('identity_accounts')
        .update({ removed_at: plan.now, last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .eq('source', 'entra')
        .eq('account_kind', 'user')
        .in('identity_id', plan.removedIdentityIds),
    )
  }

  await assertExternalInventory(supabase, tenantId)
  return { identityCount: plan.identities.length, accountCount: plan.accounts.length }
}

/**
 * Persist directory roles, assignments, and identity privilege flags.
 * Does not touch guest_identities. Soft-removes missing rows.
 */
export async function writePrivilegedInventory(plan: PrivilegedInventoryPlan) {
  const supabase = db()
  const tenantId = plan.tenantId

  for (const batch of chunk(plan.roles, 500)) {
    if (!batch.length) continue
    mustWrite('directory_roles upsert', await supabase.from('directory_roles').upsert(batch, { onConflict: 'tenant_id,ms_role_id' }))
  }
  for (const batch of chunk(plan.assignments, 500)) {
    if (!batch.length) continue
    mustWrite(
      'role_assignments upsert',
      await supabase.from('role_assignments').upsert(batch, { onConflict: 'tenant_id,ms_assignment_id' }),
    )
  }
  if (plan.removedAssignmentIds.length) {
    mustWrite(
      'role_assignments soft-remove',
      await supabase
        .from('role_assignments')
        .update({ removed_at: plan.now, last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .in('id', plan.removedAssignmentIds),
    )
  }
  if (plan.removedRoleIds.length) {
    mustWrite(
      'directory_roles soft-remove',
      await supabase
        .from('directory_roles')
        .update({ removed_at: plan.now, last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .in('id', plan.removedRoleIds),
    )
  }
  for (const batch of chunk(plan.groupEligibilities, 500)) {
    if (!batch.length) continue
    mustWrite(
      'group_pim_eligibilities upsert',
      await supabase.from('group_pim_eligibilities').upsert(batch, { onConflict: 'tenant_id,ms_schedule_id' }),
    )
  }
  if (plan.removedGroupEligibilityIds.length) {
    mustWrite(
      'group_pim_eligibilities soft-remove',
      await supabase
        .from('group_pim_eligibilities')
        .update({ removed_at: plan.now, last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .in('id', plan.removedGroupEligibilityIds),
    )
  }
  for (const batch of chunk(plan.identityPatches, 500)) {
    for (const patch of batch) {
      mustWrite(
        'identities privilege flags',
        await supabase
          .from('identities')
          .update({ is_privileged: patch.is_privileged, privilege_tier: patch.privilege_tier })
          .eq('tenant_id', tenantId)
          .eq('id', patch.id),
      )
    }
  }
  const keepPrivileged = plan.identityPatches.filter((row) => row.is_privileged).map((row) => row.id)
  let clear = supabase
    .from('identities')
    .update({ is_privileged: false, privilege_tier: null })
    .eq('tenant_id', tenantId)
    .eq('is_privileged', true)
  if (keepPrivileged.length) clear = clear.not('id', 'in', `(${keepPrivileged.join(',')})`)
  mustWrite('identities clear stale privilege', await clear)

  await assertExternalInventory(supabase, tenantId)
  return { roleCount: plan.roles.length, assignmentCount: plan.assignments.length }
}
