'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { saveAlertRule, type AlertRuleInput } from '@/lib/actions/alerts'
import { ALERT_TRIGGER_LABELS, APPROVAL_LABELS, type AlertRule, type AlertTriggerType, type ApprovalState, type RiskLevel } from '@/lib/types'
import {
  CORE_ALERT_TRIGGERS,
  PRIVILEGED_ALERT_TRIGGERS,
  alertTriggerDefaults,
  alertTriggerDescription,
  alertTriggerItems,
  showPrivilegedAlertTriggerGroup,
} from '@/lib/alerts/triggers'
import { DEFAULT_RISK_POLICY } from '@/lib/risk/engine'

const RISK_ITEMS: Record<RiskLevel, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
const ORG_STATES: ApprovalState[] = ['unreviewed', 'restricted', 'blocked']
const SELECT_TEXT = 'h-10 w-full text-base md:h-8 md:text-sm'

function toInput(rule: AlertRule | null, reviewDays: number): AlertRuleInput {
  if (!rule) {
    const defaults = alertTriggerDefaults('risk_level', reviewDays)
    return {
      name: defaults.name,
      description: defaults.description,
      triggerType: 'risk_level',
      severity: 'high',
      conditions: { min_risk_level: 'high', inactive_days: 90, approval_states: ['unreviewed', 'restricted', 'blocked'], sensitive_only: false },
      recipients: '',
      notifyEmail: true,
      enabled: true,
    }
  }
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description ?? '',
    triggerType: rule.trigger_type,
    severity: rule.severity,
    conditions: { min_risk_level: 'high', inactive_days: 90, approval_states: ['unreviewed', 'restricted', 'blocked'], sensitive_only: false, ...rule.conditions },
    recipients: rule.recipients.join(', '),
    notifyEmail: rule.notify_email,
    enabled: rule.enabled,
  }
}

export function AlertRuleDialog({
  open,
  onOpenChange,
  rule,
  privilegedEnabled = false,
  reviewDays = DEFAULT_RISK_POLICY.reviewDays,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  rule: AlertRule | null
  privilegedEnabled?: boolean
  reviewDays?: number
}) {
  const [v, setV] = useState<AlertRuleInput>(() => toInput(rule, reviewDays))
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const triggerHelp = alertTriggerDescription(v.triggerType, reviewDays)
  const showPrivileged = showPrivilegedAlertTriggerGroup(privilegedEnabled, v.triggerType)
  const triggerItems = alertTriggerItems(privilegedEnabled, v.triggerType)

  const applyTrigger = (next: AlertTriggerType) => {
    const prevDefaults = alertTriggerDefaults(v.triggerType, reviewDays)
    const nextDefaults = alertTriggerDefaults(next, reviewDays)
    const nameUntouched = !v.name.trim() || v.name === prevDefaults.name
    const descriptionUntouched = v.description === prevDefaults.description
    setV({
      ...v,
      triggerType: next,
      name: nameUntouched ? nextDefaults.name : v.name,
      description: descriptionUntouched ? nextDefaults.description : v.description,
    })
  }

  const submit = () =>
    startTransition(async () => {
      const res = await saveAlertRule(v)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
        router.refresh()
      } else toast.error(res.error)
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{rule ? 'Edit alert rule' : 'New alert rule'}</DialogTitle>
          <DialogDescription>Rules run after every scan and on the daily schedule. Each new match creates an alert and, optionally, an email digest.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto" data-alert-rule-body>
          <div className="flex flex-col gap-4 pr-1">
            <Field>
              <FieldLabel htmlFor="rule-name">Name</FieldLabel>
              <Input
                id="rule-name"
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
                placeholder="Critical identities with sensitive access"
                className={SELECT_TEXT}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rule-trigger">Trigger</FieldLabel>
                  <Select items={triggerItems} value={v.triggerType} onValueChange={(t) => applyTrigger(t as AlertTriggerType)}>
                    <SelectTrigger id="rule-trigger" className={SELECT_TEXT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="min-w-[min(22rem,calc(100vw-2rem))]">
                      {CORE_ALERT_TRIGGERS.map((t) => (
                        <SelectItem key={t} value={t} className="text-base md:text-sm">
                          {ALERT_TRIGGER_LABELS[t].label}
                        </SelectItem>
                      ))}
                      {showPrivileged && (
                        <SelectGroup>
                          <SelectLabel>Privileged access</SelectLabel>
                          {PRIVILEGED_ALERT_TRIGGERS.map((t) => (
                            <SelectItem key={t} value={t} className="text-base md:text-sm">
                              {ALERT_TRIGGER_LABELS[t].label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-severity">Alert severity</FieldLabel>
                  <Select items={RISK_ITEMS} value={v.severity} onValueChange={(s) => setV({ ...v, severity: s as RiskLevel })}>
                    <SelectTrigger id="rule-severity" className={SELECT_TEXT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(RISK_ITEMS) as RiskLevel[]).map((r) => (
                        <SelectItem key={r} value={r} className="text-base md:text-sm">
                          {RISK_ITEMS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <FieldDescription>{triggerHelp}</FieldDescription>
            </div>

            {(v.triggerType === 'risk_level' || v.triggerType === 'sensitive_access') && (
              <Field>
                <FieldLabel htmlFor="rule-min-risk">{v.triggerType === 'risk_level' ? 'Fire at or above' : 'Only identities at or above (optional)'}</FieldLabel>
                <Select items={RISK_ITEMS} value={v.conditions.min_risk_level ?? 'high'} onValueChange={(s) => setV({ ...v, conditions: { ...v.conditions, min_risk_level: s as RiskLevel } })}>
                  <SelectTrigger id="rule-min-risk" className="h-10 w-40 text-base md:h-8 md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RISK_ITEMS) as RiskLevel[]).map((r) => (
                      <SelectItem key={r} value={r} className="text-base md:text-sm">
                        {RISK_ITEMS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {v.triggerType === 'inactive_identity' && (
              <Field>
                <FieldLabel htmlFor="rule-days">Inactive for more than (days)</FieldLabel>
                <Input id="rule-days" type="number" min={1} max={3650} className="w-32" value={v.conditions.inactive_days ?? 90} onChange={(e) => setV({ ...v, conditions: { ...v.conditions, inactive_days: Number(e.target.value) } })} />
                <FieldDescription>Re-alerts once every 30 days while the identity stays inactive.</FieldDescription>
              </Field>
            )}

            {v.triggerType === 'unapproved_organization' && (
              <div className="flex flex-col gap-3">
                <Field>
                  <FieldLabel>Organization approval states</FieldLabel>
                  <div className="flex flex-wrap gap-4">
                    {ORG_STATES.map((s) => {
                      const checked = (v.conditions.approval_states ?? []).includes(s)
                      return (
                        <label key={s} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              const cur = new Set(v.conditions.approval_states ?? [])
                              if (c) cur.add(s)
                              else cur.delete(s)
                              setV({ ...v, conditions: { ...v.conditions, approval_states: Array.from(cur) } })
                            }}
                          />
                          {APPROVAL_LABELS[s]}
                        </label>
                      )
                    })}
                  </div>
                </Field>
                <div className="flex items-center gap-3">
                  <Switch id="rule-sens-only" checked={Boolean(v.conditions.sensitive_only)} onCheckedChange={(c) => setV({ ...v, conditions: { ...v.conditions, sensitive_only: c } })} />
                  <Label htmlFor="rule-sens-only">Only when the identity holds sensitive access</Label>
                </div>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="rule-desc">Description (optional)</FieldLabel>
              <Textarea id="rule-desc" rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Why this rule exists and who acts on it" />
            </Field>

            <div className="flex flex-col gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="rule-email">Send email digest</Label>
                <Switch id="rule-email" checked={v.notifyEmail} onCheckedChange={(c) => setV({ ...v, notifyEmail: c })} />
              </div>
              <Field>
                <FieldLabel htmlFor="rule-recipients">Recipients</FieldLabel>
                <Textarea id="rule-recipients" rows={2} value={v.recipients} onChange={(e) => setV({ ...v, recipients: e.target.value })} placeholder="security@contoso.com, iam-team@contoso.com" disabled={!v.notifyEmail} />
                <FieldDescription>Comma or newline separated. One digest per rule per evaluation; nothing is sent when there are no new matches.</FieldDescription>
              </Field>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end sm:flex-row">
          <div className="mr-auto flex items-center gap-3">
            <Switch id="rule-enabled" checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} />
            <Label htmlFor="rule-enabled">Enabled</Label>
          </div>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={pending}
            className="dark:bg-[oklch(0.48_0.14_250)] dark:text-white dark:hover:bg-[oklch(0.42_0.14_250)]"
          >
            {pending ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
