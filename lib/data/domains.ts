import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { ExternalDomain, Guest } from '@/lib/types'

export type DomainSummary = ExternalDomain & {
  guest_count: number
  active_count: number
  inactive_count: number
  critical_count: number
  high_count: number
  sensitive_count: number
  avg_risk: number
  last_activity: string | null
}

export async function listDomains(tenantId: string) {
  const supabase = db()
  const [domains, guests, sensitiveMemberships] = await Promise.all([
    supabase.from('external_domains').select('*').eq('tenant_id', tenantId).order('domain'),
    supabase.from('guest_identities').select('id,domain,risk_level,risk_score,last_sign_in_at,account_enabled').eq('tenant_id', tenantId).is('removed_at', null),
    supabase.from('resource_memberships').select('guest_id, resource:resources!inner(is_sensitive)').eq('tenant_id', tenantId).is('removed_at', null).eq('resources.is_sensitive', true),
  ])
  const sensitiveGuestIds = new Set((sensitiveMemberships.data ?? []).map((m) => m.guest_id as string))
  const cutoff = Date.now() - 90 * 86_400_000
  const byDomain = new Map<string, typeof guests.data>()
  for (const g of guests.data ?? []) {
    if (!g.domain) continue
    const list = byDomain.get(g.domain) ?? []
    list!.push(g)
    byDomain.set(g.domain, list!)
  }
  const result: DomainSummary[] = ((domains.data ?? []) as ExternalDomain[]).map((d) => {
    const list = byDomain.get(d.domain) ?? []
    const lastActivity = list.map((g) => g.last_sign_in_at).filter(Boolean).sort().at(-1) ?? null
    return {
      ...d,
      guest_count: list.length,
      active_count: list.filter((g) => g.last_sign_in_at && new Date(g.last_sign_in_at).getTime() >= cutoff).length,
      inactive_count: list.filter((g) => !g.last_sign_in_at || new Date(g.last_sign_in_at).getTime() < cutoff).length,
      critical_count: list.filter((g) => g.risk_level === 'critical').length,
      high_count: list.filter((g) => g.risk_level === 'high').length,
      sensitive_count: list.filter((g) => sensitiveGuestIds.has(g.id as string)).length,
      avg_risk: list.length ? Math.round(list.reduce((s, g) => s + (g.risk_score ?? 0), 0) / list.length) : 0,
      last_activity: lastActivity as string | null,
    }
  })
  return result.sort((a, b) => b.guest_count - a.guest_count)
}

export async function getDomainDetail(tenantId: string, domainName: string) {
  const supabase = db()
  const { data: domain } = await supabase.from('external_domains').select('*').eq('tenant_id', tenantId).eq('domain', domainName).maybeSingle()
  if (!domain) return null
  const { data: guests } = await supabase.from('guest_identities').select('*').eq('tenant_id', tenantId).eq('domain', domainName).is('removed_at', null).order('risk_score', { ascending: false })
  const guestIds = (guests ?? []).map((g) => g.id as string)
  const { data: memberships } = guestIds.length
    ? await supabase.from('resource_memberships').select('guest_id,resource_id, resource:resources(id,display_name,resource_type,is_sensitive,sensitivity_category)').eq('tenant_id', tenantId).in('guest_id', guestIds).is('removed_at', null)
    : { data: [] }
  const resourceMap = new Map<string, { id: string; display_name: string; resource_type: string; is_sensitive: boolean; sensitivity_category: string | null; count: number }>()
  for (const m of memberships ?? []) {
    const r = m.resource as unknown as { id: string; display_name: string; resource_type: string; is_sensitive: boolean; sensitivity_category: string | null }
    if (!r) continue
    const entry = resourceMap.get(r.id) ?? { ...r, count: 0 }
    entry.count++
    resourceMap.set(r.id, entry)
  }
  return {
    domain: domain as ExternalDomain,
    guests: (guests ?? []) as Guest[],
    resources: Array.from(resourceMap.values()).sort((a, b) => Number(b.is_sensitive) - Number(a.is_sensitive) || b.count - a.count),
  }
}
