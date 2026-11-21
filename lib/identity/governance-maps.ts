import 'server-only'
import { db } from '@/lib/supabase/admin'
import { mapsFromRows, type GovernanceIdMaps, type GuestGovernanceRef } from '@/lib/identity/governance'
import { fetchAllById } from '@/lib/supabase/page'

export async function loadGovernanceMaps(tenantId: string, guests?: GuestGovernanceRef[]): Promise<GovernanceIdMaps> {
  const supabase = db()
  const guestRows =
    guests ??
    (await fetchAllById<GuestGovernanceRef>('guest_identities maps', () =>
      supabase.from('guest_identities').select('id,identity_id').eq('tenant_id', tenantId),
    ))
  const accounts = await fetchAllById<{ id: string; identity_id: string }>('identity_accounts maps', () =>
    supabase.from('identity_accounts').select('id,identity_id').eq('tenant_id', tenantId).eq('source', 'entra'),
  )
  return mapsFromRows({
    guests: guestRows,
    accounts,
  })
}
