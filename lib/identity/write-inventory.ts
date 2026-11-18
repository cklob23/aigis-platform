import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { GuestInventoryPlan } from '@/lib/identity/ingest'

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function must(label: string, result: { error: { message: string } | null }) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
}

/**
 * Persist a dual-write inventory plan. Memberships keep using guest_id.
 * The 0004 provision trigger is not dropped; every guest row here already has identity_id.
 */
export async function writeGuestInventory(plan: GuestInventoryPlan) {
  const supabase = db()
  const tenantId = plan.tenantId

  for (const batch of chunk(plan.identities, 500)) {
    await must('identities upsert', await supabase.from('identities').upsert(batch, { onConflict: 'id' }))
  }
  for (const batch of chunk(plan.accounts, 500)) {
    await must(
      'identity_accounts upsert',
      await supabase.from('identity_accounts').upsert(batch, { onConflict: 'tenant_id,source,source_object_id' }),
    )
  }
  for (const batch of chunk(plan.guests, 500)) {
    await must('guest_identities upsert', await supabase.from('guest_identities').upsert(batch, { onConflict: 'tenant_id,ms_object_id' }))
  }

  if (plan.removedGuestIds.length) {
    await must(
      'guest_identities soft-remove',
      await supabase.from('guest_identities').update({ removed_at: plan.now }).eq('tenant_id', tenantId).in('id', plan.removedGuestIds),
    )
  }
  if (plan.removedIdentityIds.length) {
    await must(
      'identities soft-remove',
      await supabase
        .from('identities')
        .update({ removed_at: plan.now, status: 'removed', last_seen_at: plan.now })
        .eq('tenant_id', tenantId)
        .in('id', plan.removedIdentityIds),
    )
    await must(
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
    await must(
      'identity_relations clear sponsors',
      await supabase.from('identity_relations').delete().eq('tenant_id', tenantId).eq('relation_type', 'sponsors').in('from_identity_id', batch),
    )
  }
  for (const batch of chunk(plan.relations, 500)) {
    if (!batch.length) continue
    await must(
      'identity_relations upsert',
      await supabase.from('identity_relations').upsert(batch, { onConflict: 'tenant_id,from_identity_id,to_identity_id,relation_type' }),
    )
  }

  const [{ count: guestCount }, { count: identityCount }, { count: accountCount }, { count: nullIds }] = await Promise.all([
    supabase.from('guest_identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('identity_accounts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
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
