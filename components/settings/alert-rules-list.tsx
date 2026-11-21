'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail, MailX, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { AlertRuleDialog } from '@/components/settings/alert-rule-dialog'
import { RiskBadge } from '@/components/risk/risk-badge'
import { deleteAlertRule, runAlertRulesNow, toggleAlertRule } from '@/lib/actions/alerts'
import { ALERT_TRIGGER_LABELS, type AlertRule } from '@/lib/types'
import { formatDate } from '@/lib/format'

type Counts = Record<string, { total: number; open: number }>

export function AlertRulesList({
  rules,
  counts,
  canManage,
  privilegedEnabled = false,
  reviewDays,
}: {
  rules: AlertRule[]
  counts: Counts
  canManage: boolean
  privilegedEnabled?: boolean
  reviewDays?: number
}) {
  const [editing, setEditing] = useState<AlertRule | null | 'new'>(null)
  const [deleting, setDeleting] = useState<AlertRule | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const describe = (r: AlertRule) => {
    const c = r.conditions
    switch (r.trigger_type) {
      case 'risk_level':
        return `Risk ≥ ${c.min_risk_level ?? 'high'}`
      case 'inactive_identity':
        return `> ${c.inactive_days ?? 90} days inactive`
      case 'unapproved_organization':
        return `${(c.approval_states ?? ['unreviewed', 'restricted', 'blocked']).join(', ')}${c.sensitive_only ? ' · sensitive access only' : ''}`
      case 'sensitive_access':
        return c.min_risk_level ? `Identities ≥ ${c.min_risk_level}` : 'Any external identity'
      default:
        return ALERT_TRIGGER_LABELS[r.trigger_type]?.description ?? ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {rules.length} rule{rules.length === 1 ? '' : 's'} · {rules.filter((r) => r.enabled).length} enabled
        </p>
        {canManage && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await runAlertRulesNow()
                  if (res.ok) toast.success(res.message)
                  else toast.error(res.error)
                  router.refresh()
                })
              }
            >
              <Play data-icon="inline-start" /> {pending ? 'Evaluating…' : 'Evaluate now'}
            </Button>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus data-icon="inline-start" /> New rule
            </Button>
          </div>
        )}
      </div>

      <ul className="flex flex-col divide-y rounded-lg border">
        {rules.map((r) => {
          const c = counts[r.id] ?? { total: 0, open: 0 }
          return (
            <li key={r.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <RiskBadge level={r.severity} />
                  <Badge variant="outline">{ALERT_TRIGGER_LABELS[r.trigger_type]?.label ?? r.trigger_type}</Badge>
                  {r.notify_email ? (
                    <Badge variant="outline" className="gap-1">
                      <Mail className="size-3" /> {r.recipients.length}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1 text-muted-foreground">
                      <MailX className="size-3" /> in-app only
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {describe(r)}
                  {r.description ? ` · ${r.description}` : ''}
                </p>
                <p className="text-muted-foreground font-mono text-xs">
                  {c.total} alert{c.total === 1 ? '' : 's'} ({c.open} open) · last fired {r.last_fired_at ? formatDate(r.last_fired_at, true) : 'never'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
                  checked={r.enabled}
                  disabled={!canManage}
                  onCheckedChange={(enabled) =>
                    startTransition(async () => {
                      const res = await toggleAlertRule(r.id, enabled)
                      if (!res.ok) toast.error(res.error)
                      router.refresh()
                    })
                  }
                />
                {canManage && (
                  <>
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
                      <Pencil />
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
                      <Trash2 />
                    </Button>
                  </>
                )}
              </div>
            </li>
          )
        })}
        {rules.length === 0 && (
          <li className="p-6 text-center text-muted-foreground text-sm">
            No alert rules yet. {canManage ? 'Create one to start receiving email alerts after each scan.' : 'An administrator can create rules here.'}
          </li>
        )}
      </ul>

      {editing !== null && (
        <AlertRuleDialog
          key={editing === 'new' ? 'new' : editing.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          rule={editing === 'new' ? null : editing}
          privilegedEnabled={privilegedEnabled}
          reviewDays={reviewDays}
        />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Existing alerts created by this rule are kept; the rule stops evaluating immediately.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const target = deleting
                if (!target) return
                startTransition(async () => {
                  const res = await deleteAlertRule(target.id)
                  if (res.ok) toast.success(res.message)
                  else toast.error(res.error)
                  setDeleting(null)
                  router.refresh()
                })
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
