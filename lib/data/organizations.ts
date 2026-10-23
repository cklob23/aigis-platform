import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { ExternalDomain, ExternalOrganization, Guest, RiskLevel } from '@/lib/types'

export type OrganizationSummary = ExternalOrganization & {
  domains: string[]
  identity_count: number
  active_count: number
  inactive_count: number
  critical_count: number
  high_count: number
  sensitive_count: number
  avg_risk: number
  last_activity: string | null
}

const ACTIVE_WINDOW_MS = 90 * 86_400_000

function deriveRiskLevel(list: { risk_level: string | null }[]): RiskLevel {
  if (list.some((g) => g.risk_level === 'critical')) return 'critical'
  if (list.some((g) => g.risk_level === 'high')) return 'high'
  if (list.some((g) => g.risk_level === 'medium')) return 'medium'
  return 'low'
}

export async function listOrganizations(tenantId: string): Promise<OrganizationSummary[]> {
  const supabase = db()
  const [orgs, domains, identities, sensitiveMemberships] = await Promise.all([
    supabase.from('external_organizations').select('*').eq('tenant_id', tenantId).order('name'),
    supabase.from('external_domains').select('id,domain,organization_id').eq('tenant_id', tenantId),
    supabase.from('guest_identities').select('id,external_organization_id,risk_level,risk_score,last_sign_in_at').eq('tenant_id', tenantId).is('removed_at', null),
    supabase.from('resource_memberships').select('guest_id, resource:resources!inner(is_sensitive)').eq('tenant_id', tenantId).is('removed_at', null).eq('resources.is_sensitive', true),
  ])

  const sensitiveIds = new Set((sensitiveMemberships.data ?? []).map((m) => m.guest_id as string))
  const cutoff = Date.now() - ACTIVE_WINDOW_MS
  const domainsByOrg = new Map<string, string[]>()
  for (const d of domains.data ?? []) {
    if (!d.organization_id) continue
    const list = domainsByOrg.get(d.organization_id) ?? []
    list.push(d.domain as string)
    domainsByOrg.set(d.organization_id, list)
  }
  const identitiesByOrg = new Map<string, NonNullable<typeof identities.data>>()
  for (const g of identities.data ?? []) {
    if (!g.external_organization_id) continue
    const list = identitiesByOrg.get(g.external_organization_id) ?? []
    list.push(g)
    identitiesByOrg.set(g.external_organization_id, list)
  }

  return ((orgs.data ?? []) as ExternalOrganization[])
    .map((o) => {
      const list = identitiesByOrg.get(o.id) ?? []
      const lastActivity = list.map((g) => g.last_sign_in_at as string | null).filter(Boolean).sort().at(-1) ?? null
      return {
        ...o,
        risk_level: deriveRiskLevel(list),
        domains: (domainsByOrg.get(o.id) ?? []).sort(),
        identity_count: list.length,
        active_count: list.filter((g) => g.last_sign_in_at && new Date(g.last_sign_in_at as string).getTime() >= cutoff).length,
        inactive_count: list.filter((g) => !g.last_sign_in_at || new Date(g.last_sign_in_at as string).getTime() < cutoff).length,
        critical_count: list.filter((g) => g.risk_level === 'critical').length,
        high_count: list.filter((g) => g.risk_level === 'high').length,
        sensitive_count: list.filter((g) => sensitiveIds.has(g.id as string)).length,
        avg_risk: list.length ? Math.round(list.reduce((s, g) => s + ((g.risk_score as number) ?? 0), 0) / list.length) : 0,
        last_activity: lastActivity,
      }
    })
    .sort((a, b) => b.identity_count - a.identity_count || a.name.localeCompare(b.name))
}

export type OrganizationDetail = {
  organization: ExternalOrganization
  domains: ExternalDomain[]
  identities: Guest[]
  resources: { id: string; display_name: string; resource_type: string; is_sensitive: boolean; sensitivity_category: string | null; count: number }[]
  typeBreakdown: Record<string, number>
}

export async function getOrganizationDetail(tenantId: string, organizationId: string): Promise<OrganizationDetail | null> {
  const supabase = db()
  const { data: organization } = await supabase.from('external_organizations').select('*').eq('tenant_id', tenantId).eq('id', organizationId).maybeSingle()
  if (!organization) return null

  const [{ data: domains }, { data: identities }] = await Promise.all([
    supabase.from('external_domains').select('*').eq('tenant_id', tenantId).eq('organization_id', organizationId).order('domain'),
    supabase.from('guest_identities').select('*').eq('tenant_id', tenantId).eq('external_organization_id', organizationId).is('removed_at', null).order('risk_score', { ascending: false }),
  ])

  const ids = (identities ?? []).map((g) => g.id as string)
  const { data: memberships } = ids.length
    ? await supabase
        .from('resource_memberships')
        .select('guest_id,resource_id, resource:resources(id,display_name,resource_type,is_sensitive,sensitivity_category)')
        .eq('tenant_id', tenantId)
        .in('guest_id', ids)
        .is('removed_at', null)
    : { data: [] }

  const resourceMap = new Map<string, OrganizationDetail['resources'][number]>()
  for (const m of memberships ?? []) {
    const r = m.resource as unknown as Omit<OrganizationDetail['resources'][number], 'count'> | null
    if (!r) continue
    const entry = resourceMap.get(r.id) ?? { ...r, count: 0 }
    entry.count++
    resourceMap.set(r.id, entry)
  }

  const typeBreakdown: Record<string, number> = {}
  for (const g of identities ?? []) typeBreakdown[g.external_type as string] = (typeBreakdown[g.external_type as string] ?? 0) + 1

  return {
    organization: organization as ExternalOrganization,
    domains: (domains ?? []) as ExternalDomain[],
    identities: (identities ?? []) as Guest[],
    resources: Array.from(resourceMap.values()).sort((a, b) => Number(b.is_sensitive) - Number(a.is_sensitive) || b.count - a.count),
    typeBreakdown,
  }
}

/** Lightweight list for pickers (assign a domain to an organization). */
export async function listOrganizationOptions(tenantId: string) {
  const { data } = await db().from('external_organizations').select('id,name,relationship_type').eq('tenant_id', tenantId).order('name')
  return (data ?? []) as Pick<ExternalOrganization, 'id' | 'name' | 'relationship_type'>[]
}
