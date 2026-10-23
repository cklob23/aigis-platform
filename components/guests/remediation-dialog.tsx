'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Eye, ShieldOff, Trash2, UserMinus, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { remediateGuest, type RemediationType } from '@/lib/actions/remediation'
import { RESOURCE_TYPE_LABELS, type Guest, type Membership, type Resource } from '@/lib/types'
import { affectedMemberships, describeRecommendation, topFactors } from '@/lib/risk/recommendation'

const ACTIONS: { type: RemediationType; label: string; description: string; icon: typeof Scissors; destructive?: boolean }[] = [
  { type: 'remove_from_resources', label: 'Remove from selected resources', description: 'Revoke membership in specific Teams, groups, or sites. Account stays active.', icon: Scissors },
  { type: 'disable_guest', label: 'Disable sign-in', description: 'Block sign-in and revoke sessions. Memberships are preserved for easy restore.', icon: ShieldOff },
  { type: 'remove_all_access', label: 'Remove all access', description: 'Remove every membership and disable the account.', icon: UserMinus, destructive: true },
  { type: 'delete_guest', label: 'Delete guest', description: 'Soft-delete the account from Entra ID (recoverable for 30 days by a tenant admin).', icon: Trash2, destructive: true },
]

const RECOMMENDED_TYPE: Record<Guest['recommended_action'], RemediationType> = {
  remove: 'remove_all_access',
  disable: 'disable_guest',
  remove_selected: 'remove_from_resources',
  review: 'remove_from_resources',
  keep: 'remove_from_resources',
}

export function RemediationDialog({
  guest,
  memberships,
  canExecute,
  isDemo,
  monitorOnly,
  trigger,
}: {
  guest: Guest
  memberships: (Membership & { resource: Resource })[]
  canExecute: boolean
  isDemo: boolean
  monitorOnly: boolean
  trigger: React.ReactElement
}) {
  const recommendation = describeRecommendation(guest)
  const previewTargets = affectedMemberships(guest.recommended_action, memberships)
  const previewSignIn = guest.recommended_action === 'remove' || guest.recommended_action === 'disable'
  const reasons = topFactors(guest.risk_factors)

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'preview' | 'configure'>('preview')
  const [type, setType] = useState<RemediationType>(RECOMMENDED_TYPE[guest.recommended_action])
  const [resourceIds, setResourceIds] = useState<Set<string>>(new Set(memberships.filter((m) => m.resource.is_sensitive).map((m) => m.resource.id)))
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const toggle = (id: string) =>
    setResourceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setStep('preview')
  }

  const submit = () => {
    startTransition(async () => {
      const res = await remediateGuest({ guestId: guest.id, actionType: type, resourceIds: Array.from(resourceIds), reason, confirmText: confirm })
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  const selectedAction = ACTIONS.find((a) => a.type === type)!
  const needsConfirm = type === 'delete_guest'
  const confirmTarget = guest.email ?? guest.display_name ?? ''
  const reasonOk = reason.trim().length >= 4
  const disabled = pending || !reasonOk || (type === 'remove_from_resources' && resourceIds.size === 0) || (needsConfirm && confirm !== confirmTarget)
  const executionCopy = monitorOnly
    ? 'This tenant is monitor-only. Continuing records a remediation request in the queue; nothing is changed in Entra until enforcement is enabled in Settings.'
    : canExecute
      ? 'Enforcement is on. Changes are applied to Microsoft 365 when you confirm on the next step and are recorded in the audit log.'
      : 'Your role can request remediation; an administrator must approve before anything changes.'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        {step === 'preview' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="size-4 text-muted-foreground" /> Preview: {recommendation.label.toLowerCase()} for {guest.display_name ?? guest.email}
              </DialogTitle>
              <DialogDescription>{recommendation.summary} Nothing happens until you continue and confirm.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <Alert>
                <ShieldOff />
                <AlertTitle>{monitorOnly ? 'Monitor-only tenant: nothing is removed yet' : isDemo ? 'Demo tenant: changes are simulated' : 'Review before you continue'}</AlertTitle>
                <AlertDescription>{executionCopy}</AlertDescription>
              </Alert>

              <section aria-labelledby="preview-why" className="flex flex-col gap-1.5">
                <h3 id="preview-why" className="font-medium text-sm">
                  Why this is recommended
                </h3>
                <ul className="flex flex-col gap-1 rounded-md border p-3 text-sm">
                  {reasons.map((f) => (
                    <li key={f.key} className="flex items-baseline gap-3">
                      <span className="tnum w-8 shrink-0 text-right font-mono text-xs">+{f.points}</span>
                      <span className="flex min-w-0 flex-col">
                        <span>{f.label}</span>
                        {f.detail && <span className="text-muted-foreground text-xs">{f.detail}</span>}
                      </span>
                    </li>
                  ))}
                  {reasons.length === 0 && <li className="text-muted-foreground">No risk factors recorded.</li>}
                </ul>
              </section>

              <section aria-labelledby="preview-changes" className="flex flex-col gap-1.5">
                <h3 id="preview-changes" className="font-medium text-sm">
                  What would change
                </h3>
                <ul className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-md border text-sm">
                  {previewSignIn && (
                    <li className="flex items-center gap-3 px-3 py-2">
                      <ShieldOff className="size-4 shrink-0 text-destructive" />
                      <span>Sign-in blocked and active sessions revoked</span>
                    </li>
                  )}
                  {previewTargets.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                      <Scissors className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{m.resource.display_name}</span>
                        <span className="text-muted-foreground text-xs">
                          {RESOURCE_TYPE_LABELS[m.resource.resource_type]} · membership removed{m.membership_type === 'owner' && ' (owner)'}
                        </span>
                      </span>
                      {m.resource.is_sensitive && (
                        <Badge variant="outline" className="border-warning/50 text-warning capitalize">
                          {m.resource.sensitivity_category}
                        </Badge>
                      )}
                    </li>
                  ))}
                  {!previewSignIn && previewTargets.length === 0 && (
                    <li className="px-3 py-3 text-muted-foreground">
                      {guest.recommended_action === 'review' ? 'The recommendation is to review, not to change access. You can still choose an action on the next step.' : 'No membership changes are recommended.'}
                    </li>
                  )}
                </ul>
                {previewTargets.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    {previewTargets.length} of {memberships.length} memberships affected. You can adjust the selection on the next step.
                  </p>
                )}
              </section>

              <Field>
                <FieldLabel htmlFor="rem-reason">Reason (required)</FieldLabel>
                <Textarea id="rem-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Engagement ended March 2026 per sponsor confirmation" rows={2} />
                <FieldDescription>Stored on the audit event and included in compliance exports.</FieldDescription>
              </Field>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('configure')} disabled={!reasonOk}>
                Continue to action
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Remediate {guest.display_name ?? guest.email}</DialogTitle>
              <DialogDescription>
                {executionCopy}
                {isDemo && ' Demo tenant: changes are simulated locally.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div role="radiogroup" aria-label="Remediation action" className="grid gap-2 sm:grid-cols-2">
                {ACTIONS.map((a) => (
                  <button
                    key={a.type}
                    type="button"
                    role="radio"
                    aria-checked={type === a.type}
                    onClick={() => setType(a.type)}
                    className={`flex flex-col gap-1 rounded-md border p-3 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${type === a.type ? (a.destructive ? 'border-destructive bg-destructive/5' : 'border-primary bg-primary/5') : 'hover:bg-accent/50'}`}
                  >
                    <span className="flex items-center gap-2 font-medium text-sm">
                      <a.icon className={`size-4 ${a.destructive ? 'text-destructive' : 'text-primary'}`} />
                      {a.label}
                      {a.type === RECOMMENDED_TYPE[guest.recommended_action] && guest.recommended_action !== 'keep' && guest.recommended_action !== 'review' && (
                        <Badge variant="secondary" className="ml-auto">
                          Recommended
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">{a.description}</span>
                  </button>
                ))}
              </div>

              {type === 'remove_from_resources' && (
                <Field>
                  <FieldLabel>Resources to remove ({resourceIds.size} selected)</FieldLabel>
                  <div className="flex max-h-48 flex-col divide-y overflow-y-auto rounded-md border">
                    {memberships.map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/40">
                        <Checkbox checked={resourceIds.has(m.resource.id)} onCheckedChange={() => toggle(m.resource.id)} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate">{m.resource.display_name}</span>
                          <span className="text-muted-foreground text-xs">
                            {RESOURCE_TYPE_LABELS[m.resource.resource_type]}
                            {m.membership_type === 'owner' && ' · owner'}
                          </span>
                        </span>
                        {m.resource.is_sensitive && (
                          <Badge variant="outline" className="border-warning/50 text-warning capitalize">
                            {m.resource.sensitivity_category}
                          </Badge>
                        )}
                      </label>
                    ))}
                    {memberships.length === 0 && <p className="p-3 text-muted-foreground text-sm">This guest has no current memberships.</p>}
                  </div>
                </Field>
              )}

              {selectedAction.destructive && (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>This affects {memberships.length} memberships</AlertTitle>
                  <AlertDescription>
                    {type === 'delete_guest' ? 'The account is removed from the directory. Shared files owned by the guest may become inaccessible.' : 'The guest will lose access to every resource in this tenant and will be unable to sign in.'}
                  </AlertDescription>
                </Alert>
              )}

              <Field>
                <FieldLabel htmlFor="rem-reason-2">Reason</FieldLabel>
                <Textarea id="rem-reason-2" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
              </Field>

              {needsConfirm && (
                <Field>
                  <FieldLabel htmlFor="rem-confirm">
                    Type <span className="font-mono">{confirmTarget}</span> to confirm
                  </FieldLabel>
                  <Input id="rem-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                </Field>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="ghost" onClick={() => setStep('preview')}>
                <ArrowLeft data-icon="inline-start" /> Back to preview
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button variant={selectedAction.destructive && !monitorOnly ? 'destructive' : 'default'} onClick={submit} disabled={disabled}>
                  {pending ? 'Saving…' : monitorOnly ? 'Record request' : canExecute ? selectedAction.label : 'Submit request'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
