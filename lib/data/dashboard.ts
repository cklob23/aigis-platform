import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { Finding, Guest, RiskLevel } from '@/lib/types'

export type Snapshot = {
  total_guests: number
  critical: number
  high: number
  medium: number
  low: number
  inactive_90: number
  never_signed_in: number
  pending_invites: number
  no_sponsor: number
  disabled: number
  domains: number
  unknown_domains: number
  resources_with_guests: number
  sensitive_with_guests: number
  memberships: number
} & Record<string, number | string>

export async function getSidebarCounts(tenantId: string) {
  const supabase = db()
  const [critical, alerts, reviews] = await Promise.all([
    supabase.from('guest_identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('removed_at', null).eq('risk_level', 'critical'),
    supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'open'),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending'),
  ])
  return { critical: critical.count ?? 0, openAlerts: alerts.count ?? 0, pendingReviews: reviews.count ?? 0 }
}

/** Identity counts for each access-review scope option, so the wizard can show what it will cover. */
export async function getReviewScopeCounts(tenantId: string) {
  const supabase = db()
  const base = () => supabase.from('guest_identities').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('removed_at', null)
  const [all, highCritical] = await Promise.all([base(), base().in('risk_level', ['high', 'critical'])])
  return { all_external: all.count ?? 0, high_critical: highCritical.count ?? 0 }
}

export async function getDashboardData(tenantId: string) {
  const supabase = db()
  const [snapshots, topGuests, domains, sensitiveResources, findings, alerts, latestScan, reviewPending] = await Promise.all([
    supabase.from('scan_results').select('snapshot,created_at').eq('tenant_id', tenantId).order('created_at', { ascending: true }).limit(60),
    supabase.from('guest_identities').select('*').eq('tenant_id', tenantId).is('removed_at', null).order('risk_score', { ascending: false }).limit(8),
    supabase.from('external_domains').select('id,domain,classification').eq('tenant_id', tenantId),
    supabase.from('resources').select('id,display_name,resource_type,sensitivity_category,external_member_count').eq('tenant_id', tenantId).is('removed_at', null).eq('is_sensitive', true).gt('external_member_count', 0).order('external_member_count', { ascending: false }).limit(6),
    supabase.from('risk_findings').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('created_at', { ascending: false }).limit(50),
    supabase.from('alerts').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('created_at', { ascending: false }).limit(5),
    supabase.from('scan_jobs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'pending'),
  ])

  const series: (Snapshot & { date: string })[] = (snapshots.data ?? []).map((s) => ({ ...(s.snapshot as Snapshot), date: s.created_at as string }))
  const current = series.at(-1) ?? null
  const weekAgo = series.length > 1 ? series.find((s) => new Date(s.date).getTime() <= Date.now() - 6.5 * 86_400_000) ?? series[0] : null

  // Guest count by domain for the top-domains widget
  const { data: domainCounts } = await supabase.from('guest_identities').select('domain').eq('tenant_id', tenantId).is('removed_at', null)
  const perDomain = new Map<string, number>()
  for (const g of domainCounts ?? []) if (g.domain) perDomain.set(g.domain, (perDomain.get(g.domain) ?? 0) + 1)
  const classificationByDomain = new Map((domains.data ?? []).map((d) => [d.domain as string, d.classification as string]))
  const topDomains = Array.from(perDomain.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([domain, count]) => ({ domain, count, classification: classificationByDomain.get(domain) ?? 'unknown' }))

  const findingsBySeverity = (findings.data ?? []).reduce(
    (acc, f) => {
      acc[f.severity as RiskLevel]++
      return acc
    },
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<RiskLevel, number>,
  )

  return {
    current,
    weekAgo,
    series,
    topGuests: (topGuests.data ?? []) as Guest[],
    topDomains,
    sensitiveResources: sensitiveResources.data ?? [],
    findings: (findings.data ?? []) as Finding[],
    findingsBySeverity,
    alerts: alerts.data ?? [],
    latestScan: latestScan.data,
    pendingReviews: reviewPending.count ?? 0,
  }
}
