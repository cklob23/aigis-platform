import 'server-only'
import { db } from '@/lib/supabase/admin'
import { mapsFromRows, type GovernanceIdMaps, type GuestGovernanceRef } from '@/lib/identity/governance'

export async function loadGovernanceMaps(tenantId: string, guests?: GuestGovernanceRef[]): Promise<GovernanceIdMaps> {
  const supabase = db()
  const guestRows =
    guests ??
    (((await supabase.from('guest_identities').select('id,identity_id').eq('tenant_id', tenantId)).data ?? []) as GuestGovernanceRef[])
  const { data: accounts } = await supabase.from('identity_accounts').select('id,identity_id').eq('tenant_id', tenantId).eq('source', 'entra')
  return mapsFromRows({
    guests: guestRows,
    accounts: (accounts ?? []) as { id: string; identity_id: string }[],
  })
}
