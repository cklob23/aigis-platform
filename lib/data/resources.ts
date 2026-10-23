import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { Guest, Membership, Resource, ResourceType } from '@/lib/types'

export async function listResources(tenantId: string, f: { type?: ResourceType | 'all'; q?: string; sensitive?: boolean; withGuests?: boolean }) {
  let q = db().from('resources').select('*').eq('tenant_id', tenantId).is('removed_at', null)
  if (f.type && f.type !== 'all') q = q.eq('resource_type', f.type)
  if (f.q) q = q.ilike('display_name', `%${f.q}%`)
  if (f.sensitive) q = q.eq('is_sensitive', true)
  if (f.withGuests !== false) q = q.gt('external_member_count', 0)
  const { data } = await q.order('is_sensitive', { ascending: false }).order('external_member_count', { ascending: false }).limit(500)
  return (data ?? []) as Resource[]
}

export async function getResourceCounts(tenantId: string) {
  const { data } = await db().from('resources').select('resource_type,is_sensitive,external_member_count').eq('tenant_id', tenantId).is('removed_at', null)
  const counts: Record<string, { total: number; withGuests: number; sensitiveWithGuests: number }> = {}
  for (const r of data ?? []) {
    const c = (counts[r.resource_type as string] ??= { total: 0, withGuests: 0, sensitiveWithGuests: 0 })
    c.total++
    if ((r.external_member_count ?? 0) > 0) {
      c.withGuests++
      if (r.is_sensitive) c.sensitiveWithGuests++
    }
  }
  return counts
}

export async function getResourceDetail(tenantId: string, resourceId: string) {
  const supabase = db()
  const { data: resource } = await supabase.from('resources').select('*').eq('tenant_id', tenantId).eq('id', resourceId).maybeSingle()
  if (!resource) return null
  const [memberships, linked, children] = await Promise.all([
    supabase.from('resource_memberships').select('*, guest:guest_identities(*)').eq('tenant_id', tenantId).eq('resource_id', resourceId).is('removed_at', null),
    resource.linked_resource_id ? supabase.from('resources').select('id,display_name,resource_type').eq('id', resource.linked_resource_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('resources').select('id,display_name,resource_type,web_url').eq('tenant_id', tenantId).eq('linked_resource_id', resourceId),
  ])
  return {
    resource: resource as Resource,
    memberships: ((memberships.data ?? []) as (Membership & { guest: Guest })[]).sort((a, b) => b.guest.risk_score - a.guest.risk_score),
    linked: linked.data,
    children: children.data ?? [],
  }
}
