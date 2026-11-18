import Link from 'next/link'
import { ArrowRight, AlertTriangle, ShieldAlert, TrendingUp } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { getDashboardData } from '@/lib/data/dashboard'
import { can } from '@/lib/auth/rbac'
import { PageHeader } from '@/components/layout/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { TrendChart } from '@/components/dashboard/trend-chart'
import { ScanButton } from '@/components/scans/scan-button'
import { RiskBadge, SeverityDot } from '@/components/risk/risk-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { relativeDays, formatNumber } from '@/lib/format'
import { RESOURCE_TYPE_LABELS, type DomainClassification, type ResourceType } from '@/lib/types'
import { DomainClassBadge } from '@/components/domains/domain-class-badge'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const { session, tenant } = await requireOnboarded()
  const d = await getDashboardData(tenant.id)
  const cur = d.current
  const prev = d.weekAgo
  const delta = (k: string) => (cur && prev ? (Number(cur[k]) || 0) - (Number(prev[k]) || 0) : null)
  const runningJob = d.latestScan && ['queued', 'running'].includes(d.latestScan.status) ? d.latestScan.id : null

  if (!cur) {
    return (
      <>
        <PageHeader title="Dashboard" description={`${tenant.display_name} · no scan data yet`} actions={can(session.role, 'scan.run') ? <ScanButton initialJobId={runningJob} label="Run first scan" /> : null} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldAlert />
            </EmptyMedia>
            <EmptyTitle>No inventory yet</EmptyTitle>
            <EmptyDescription>Run the first scan to discover external identities, the organizations behind them, and the resources they can reach.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    )
  }

  const exposurePct = cur.total_guests ? Math.round(((cur.critical + cur.high) / cur.total_guests) * 100) : 0
  const trend = d.series.slice(-12).map((s) => ({ date: s.date, critical: Number(s.critical) || 0, high: Number(s.high) || 0, inactive_90: Number(s.inactive_90) || 0 }))

  return (
    <>
      <PageHeader
        eyebrow={tenant.display_name}
        title="External access posture"
        description={`${formatNumber(cur.total_guests)} external identities across ${cur.domains} external domains. ${exposurePct}% are critical or high risk.`}
        subtitle="Governing external identities today. Privileged, non-human, and AI agent types will use the same reviews and audit model."
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/reports" />}>
              Export report
            </Button>
            {can(session.role, 'scan.run') && <ScanButton initialJobId={runningJob} />}
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6" aria-label="Key metrics">
        <StatCard label="External identities" value={cur.total_guests} delta={delta('total_guests')} href="/guests" hint="active in directory" />
        <StatCard label="Critical risk" value={cur.critical} delta={delta('critical')} href="/guests?risk=critical" tone="critical" hint="recommend removal" />
        <StatCard label="High risk" value={cur.high} delta={delta('high')} href="/guests?risk=high" tone="warning" hint="needs review" />
        <StatCard label="Inactive 90d+" value={cur.inactive_90} delta={delta('inactive_90')} href="/guests?activity=inactive90" hint={`${cur.never_signed_in} never signed in`} />
        <StatCard label="Sensitive exposure" value={cur.sensitive_with_guests} delta={delta('sensitive_with_guests')} href="/resources?sensitive=1" hint="sensitive resources with guests" />
        <StatCard label="Unknown domains" value={cur.unknown_domains} delta={delta('unknown_domains')} href="/domains?classification=unknown" hint={`of ${cur.domains} domains`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Risk trend</CardTitle>
            <CardDescription>
              {trend.length >= 2
                ? `Critical, high, and inactive identities per scan over the last ${trend.length} scans.`
                : 'Critical, high, and inactive identities per scan.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {trend.length >= 2 ? (
              <TrendChart series={trend} />
            ) : (
              <Empty className="border-dashed py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TrendingUp />
                  </EmptyMedia>
                  <EmptyTitle>Not enough scans to plot a trend</EmptyTitle>
                  <EmptyDescription>
                    {trend.length === 0 ? 'Two completed scans are needed; none have recorded a snapshot yet.' : 'One scan has been recorded. One more completed scan is needed before a trend can be drawn.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Open alerts</CardTitle>
              <CardDescription>{d.alerts.length ? 'Needs attention' : 'No open alerts'}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/alerts" />}>
              View all <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {d.alerts.length === 0 && (
              <p className="pb-2.5 text-muted-foreground text-xs leading-relaxed">
                Alerts fire on <span className="text-foreground">change</span> between scans, not on standing risk.
                {cur.critical > 0 ? (
                  <>
                    {' '}
                    The {formatNumber(cur.critical)} critical identities live in the{' '}
                    <Link href="/guests?risk=critical" className="text-foreground underline-offset-4 hover:underline">
                      risk queue
                    </Link>
                    .
                  </>
                ) : (
                  ' Standing risk is tracked in the risk queue.'
                )}
              </p>
            )}
            {d.alerts.map((a) => (
              <div key={a.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <SeverityDot severity={a.severity} className="mt-1.5" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{a.title}</span>
                  <span className="line-clamp-1 text-muted-foreground text-xs">{a.description}</span>
                </div>
                <span className="ml-auto shrink-0 font-mono text-muted-foreground text-xs">{relativeDays(a.created_at)}</span>
              </div>
            ))}
            {d.pendingReviews > 0 && (
              <div className="flex items-center gap-3 py-2.5 last:pb-0">
                <AlertTriangle className="size-4 text-warning" />
                <span className="text-sm">
                  {d.pendingReviews} review decisions pending
                </span>
                <Button variant="link" size="sm" className="ml-auto" nativeButton={false} render={<Link href="/reviews" />}>
                  Open
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Highest-risk identities</CardTitle>
              <CardDescription>Ordered by composite risk score</CardDescription>
            </div>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/guests" />}>
              All <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {d.topGuests.map((g) => (
              <Link key={g.id} href={`/guests/${g.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{g.display_name ?? g.email}</span>
                  <span className="truncate font-mono text-muted-foreground text-xs">{g.email}</span>
                </div>
                <RiskBadge level={g.risk_level} score={g.risk_score} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Top external domains</CardTitle>
              <CardDescription>By identity count</CardDescription>
            </div>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/domains" />}>
              All <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {d.topDomains.map((dm) => (
              <Link key={dm.domain} href={`/domains/${encodeURIComponent(dm.domain)}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50 first:pt-0 last:pb-0">
                <span className="truncate font-mono text-sm">{dm.domain}</span>
                <DomainClassBadge classification={dm.classification as DomainClassification} className="ml-auto" />
                <span className="tnum w-8 text-right font-mono text-xs">{dm.count}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <CardTitle>Sensitive resources with external access</CardTitle>
              <CardDescription>Heuristic classification · editable</CardDescription>
            </div>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/resources?sensitive=1" />}>
              All <ArrowRight data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {d.sensitiveResources.map((r) => (
              <Link key={r.id} href={`/resources/${r.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{r.display_name}</span>
                  <span className="text-muted-foreground text-xs">{RESOURCE_TYPE_LABELS[r.resource_type as ResourceType]}</span>
                </div>
                <Badge variant="outline" className="capitalize">
                  {r.sensitivity_category}
                </Badge>
                <span className="tnum w-8 text-right font-mono text-xs">{r.external_member_count}</span>
              </Link>
            ))}
            {d.sensitiveResources.length === 0 && <p className="py-4 text-muted-foreground text-sm">No sensitive resources currently expose external access.</p>}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Open findings</CardTitle>
            <CardDescription>
              {d.findingsBySeverity.critical} critical · {d.findingsBySeverity.high} high · generated from the latest scoring pass
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {d.findings.slice(0, 9).map((f) => (
                <Link key={f.id} href={f.guest_id ? `/guests/${f.guest_id}` : '#'} className="flex flex-col gap-1 rounded-md border p-3 transition-colors hover:bg-accent/40">
                  <div className="flex items-center gap-2">
                    <SeverityDot severity={f.severity} />
                    <span className="truncate text-sm">{f.title}</span>
                  </div>
                  <span className="line-clamp-2 text-muted-foreground text-xs">{f.description}</span>
                </Link>
              ))}
            </div>
            {d.findings.length === 0 && <p className="text-muted-foreground text-sm">No open findings.</p>}
          </CardContent>
        </Card>
      </section>
    </>
  )
}
