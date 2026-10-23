import Link from 'next/link'
import { ArrowRight, Bell, Mail, MessageSquare, Webhook } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SeverityDot } from '@/components/risk/risk-badge'
import { ALERT_TRIGGER_LABELS, type AlertRule, type AlertTriggerType } from '@/lib/types'
import { relativeDays } from '@/lib/format'

function conditionSummary(rule: AlertRule) {
  const c = rule.conditions
  const parts: string[] = []
  if (c.min_risk_level) parts.push(`risk ≥ ${c.min_risk_level}`)
  if (c.inactive_days) parts.push(`inactive > ${c.inactive_days}d`)
  if (c.approval_states?.length) parts.push(`org ${c.approval_states.join(' / ')}`)
  if (c.sensitive_only) parts.push('sensitive resources only')
  return parts.join(' · ')
}

/**
 * Read-only view of what can raise an alert. Rules are edited in Settings; this
 * is here so an admin can see the trigger set without leaving the queue.
 */
export function AlertRuleReference({ rules, canManage, notifyEmail }: { rules: AlertRule[]; canManage: boolean; notifyEmail: boolean }) {
  const enabled = rules.filter((r) => r.enabled)
  const disabled = rules.filter((r) => !r.enabled)
  const coveredTriggers = new Set(enabled.map((r) => r.trigger_type))
  const uncovered = (Object.keys(ALERT_TRIGGER_LABELS) as AlertTriggerType[]).filter((t) => !coveredTriggers.has(t))

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>What raises an alert</CardTitle>
            <CardDescription>
              {enabled.length} enabled rule{enabled.length === 1 ? '' : 's'}. Each fires once per identity when a scan first observes the condition; it does not re-fire while the condition persists.
            </CardDescription>
          </div>
          {canManage && (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/settings/alerts" />}>
              Edit rules <ArrowRight data-icon="inline-end" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {enabled.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border">
              {enabled.map((r) => (
                <li key={r.id} className="flex items-start gap-3 p-3">
                  <SeverityDot severity={r.severity} className="mt-1.5 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">{r.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {ALERT_TRIGGER_LABELS[r.trigger_type].description}
                      {conditionSummary(r) && <span className="font-mono"> · {conditionSummary(r)}</span>}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <Badge variant="outline" className="capitalize">
                      {r.severity}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{r.last_fired_at ? `fired ${relativeDays(r.last_fired_at)}` : 'never fired'}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No rules are enabled, so scans will not raise alerts. {canManage ? 'Enable one in Settings.' : 'Ask an administrator to enable one in Settings.'}</p>
          )}
          {(disabled.length > 0 || uncovered.length > 0) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Not currently alerting</span>
              <div className="flex flex-wrap gap-1.5">
                {disabled.map((r) => (
                  <Badge key={r.id} variant="outline" className="text-muted-foreground">
                    {r.name} · disabled
                  </Badge>
                ))}
                {uncovered.map((t) => (
                  <Badge key={t} variant="outline" className="text-muted-foreground">
                    {ALERT_TRIGGER_LABELS[t].label}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Where alerts are delivered beyond this queue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <ChannelRow icon={<Mail className="size-4" />} label="Email" status={notifyEmail ? 'on' : 'off'} detail={notifyEmail ? 'Sent through Microsoft Graph per rule recipients.' : 'Enable per rule in Settings.'} href={canManage ? '/settings/alerts' : undefined} />
          <ChannelRow icon={<MessageSquare className="size-4" />} label="Microsoft Teams" status="soon" detail="Post to a channel via incoming webhook." />
          <ChannelRow icon={<Webhook className="size-4" />} label="Webhook" status="soon" detail="JSON payload to a SIEM or ticketing endpoint." />
          <ChannelRow icon={<Bell className="size-4" />} label="In-app" status="on" detail="Open alerts are counted in the sidebar." />
        </CardContent>
      </Card>
    </div>
  )
}

function ChannelRow({ icon, label, status, detail, href }: { icon: React.ReactNode; label: string; status: 'on' | 'off' | 'soon'; detail: string; href?: string }) {
  const badge =
    status === 'on' ? (
      <Badge className="bg-success/15 text-success hover:bg-success/15">On</Badge>
    ) : status === 'off' ? (
      <Badge variant="outline" className="text-muted-foreground">
        Off
      </Badge>
    ) : (
      <Badge variant="outline" className="text-muted-foreground">
        Coming soon
      </Badge>
    )
  const inner = (
    <>
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2 text-sm">
          {label}
          {badge}
        </span>
        <span className="text-muted-foreground text-xs">{detail}</span>
      </div>
    </>
  )
  return href ? (
    <Link href={href} className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-accent/40">
      {inner}
    </Link>
  ) : (
    <div className="flex items-start gap-3 rounded-md border p-3" aria-disabled={status === 'soon'}>
      {inner}
    </div>
  )
}
