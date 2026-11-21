import Link from 'next/link'
import { ArrowRight, BellOff, CheckCheck, History } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can, canViewPrivilegedDetail } from '@/lib/auth/rbac'
import { redactPrivilegedAlert, REDACTED_PRIVILEGED_ALERT_TITLE } from '@/lib/alerts/redact'
import { listAlerts } from '@/lib/data/governance'
import { listAlertRules } from '@/lib/data/alerts'
import { getSidebarCounts } from '@/lib/data/dashboard'
import { PageHeader } from '@/components/layout/page-header'
import { SeverityDot } from '@/components/risk/risk-badge'
import { AcknowledgeButton } from '@/components/alerts/acknowledge-button'
import { AlertTabs, type AlertTab } from '@/components/alerts/alert-tabs'
import { AlertRuleReference } from '@/components/alerts/alert-rule-reference'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { formatNumber, relativeDays } from '@/lib/format'
import type { RiskLevel } from '@/lib/types'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Alerts' }

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { session, tenant } = await requireOnboarded()
  const { tab } = await searchParams
  const [rawAlerts, rules, { critical }] = await Promise.all([listAlerts(tenant.id), listAlertRules(tenant.id), getSidebarCounts(tenant.id)])
  const alerts = rawAlerts.map((a) => redactPrivilegedAlert(a, canViewPrivilegedDetail(session.role)))
  const open = alerts.filter((a) => a.status === 'open')
  const acknowledged = alerts.filter((a) => a.status === 'acknowledged')
  const resolved = alerts.filter((a) => a.status !== 'open' && a.status !== 'acknowledged')
  const canAck = can(session.role, 'review.decide')
  const canManage = can(session.role, 'settings.manage')
  const initialTab: AlertTab = tab === 'acknowledged' || tab === 'resolved' ? tab : 'open'

  const Row = ({ a }: { a: (typeof alerts)[number] }) => {
    const redacted = a.title === REDACTED_PRIVILEGED_ALERT_TITLE
    const guest = redacted ? null : (a.guest as unknown as { id: string; display_name: string | null; email: string | null; domain: string | null } | null)
    const resource = a.resource as unknown as { id: string; display_name: string } | null
    return (
      <li className={cn('flex flex-col gap-2 p-4 md:flex-row md:items-center', a.status !== 'open' && 'opacity-70')}>
        <SeverityDot severity={a.severity as RiskLevel} className="mt-1 shrink-0 self-start md:self-center" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium text-sm">{a.title}</span>
          <span className="text-muted-foreground text-xs">{a.description}</span>
          <div className="flex flex-wrap gap-2 text-xs">
            {guest && (
              <Link href={`/guests/${guest.id}`} className="font-mono underline-offset-4 hover:underline">
                {guest.email ?? guest.display_name}
              </Link>
            )}
            {resource && (
              <Link href={`/resources/${resource.id}`} className="underline-offset-4 hover:underline">
                {resource.display_name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="capitalize">
            {a.alert_type.replace(/_/g, ' ')}
          </Badge>
          <span className="font-mono text-muted-foreground text-xs">{relativeDays(a.created_at)}</span>
          {a.status === 'open' && canAck ? <AcknowledgeButton alertId={a.id} /> : <span className="text-muted-foreground text-xs capitalize">{a.status}</span>}
        </div>
      </li>
    )
  }

  const List = ({ items }: { items: typeof alerts }) => (
    <ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
      {items.map((a) => (
        <Row key={a.id} a={a} />
      ))}
    </ul>
  )

  const openPanel =
    open.length === 0 ? (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff />
          </EmptyMedia>
          <EmptyTitle>No open alerts</EmptyTitle>
          <EmptyDescription>
            Alerts fire only on <span className="text-foreground">change</span> between scans: a guest newly reaching a sensitive resource, a sponsor being disabled, a blocked domain gaining access. Standing risk does not raise an alert, so
            {critical > 0 ? ` the ${formatNumber(critical)} critical identities in this tenant live in the risk queue, not here.` : ' a quiet tenant can still carry critical identities in the risk queue.'}
            {alerts.length > 0 && ` ${formatNumber(alerts.length)} earlier alert${alerts.length === 1 ? ' has' : 's have'} been handled; see the other tabs.`}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button nativeButton={false} render={<Link href="/guests?risk=critical" />}>
              Open critical identities{critical > 0 && ` (${formatNumber(critical)})`} <ArrowRight data-icon="inline-end" />
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/scans" />}>
              Scan history
            </Button>
          </div>
        </EmptyContent>
      </Empty>
    ) : (
      <List items={open} />
    )

  const historyEmpty = (icon: React.ReactNode, title: string, description: string) => (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )

  return (
    <>
      <PageHeader title="Alerts" description={`${open.length} open · ${alerts.length} total. Alerts are raised by scans when posture changes materially: new sensitive exposure, blocked-domain access, disabled sponsors.`} />
      <AlertTabs
        initial={initialTab}
        counts={{ open: open.length, acknowledged: acknowledged.length, resolved: resolved.length }}
        panels={{
          open: openPanel,
          acknowledged:
            acknowledged.length > 0 ? <List items={acknowledged} /> : historyEmpty(<CheckCheck />, 'Nothing acknowledged', 'Acknowledging an alert keeps it on record but removes it from the open queue and the sidebar count. Acknowledged alerts appear here.'),
          resolved:
            resolved.length > 0
              ? <List items={resolved} />
              : historyEmpty(<History />, 'No resolved or dismissed alerts', 'When a later scan no longer observes the condition that raised an alert, or an administrator dismisses it, it moves here. The underlying identity and the audit log keep the full history.'),
        }}
      />
      <AlertRuleReference rules={rules} canManage={canManage} notifyEmail={rules.some((r) => r.enabled && r.notify_email)} />
    </>
  )
}
