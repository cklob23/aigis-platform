'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { createAccessReview } from '@/lib/actions/governance'
import {
  REVIEW_NO_RESPONSE_LABELS,
  REVIEW_RECURRENCE_LABELS,
  REVIEW_REVIEWER_LABELS,
  REVIEW_SCOPE_LABELS,
  type ReviewNoResponseAction,
  type ReviewRecurrence,
  type ReviewReviewerKind,
  type ReviewScopeKind,
} from '@/lib/types'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  /** When omitted, only the "selected guests" scope is offered. */
  scopeCounts?: { all_external: number; high_critical: number }
  /** Pre-selected guest ids when launched from External identities. */
  selectedGuestIds?: string[]
  defaultReviewerEmails?: string[]
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const STEPS = ['Scope', 'Reviewers', 'Schedule', 'Confirm'] as const

export function NewReviewWizard({ scopeCounts, selectedGuestIds = [], defaultReviewerEmails = [], trigger, open: controlledOpen, onOpenChange }: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = (v: boolean) => {
    onOpenChange?.(v)
    if (controlledOpen === undefined) setUncontrolledOpen(v)
  }
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const hasSelection = selectedGuestIds.length > 0
  const [scope, setScope] = useState<ReviewScopeKind>(hasSelection ? 'selected' : 'high_critical')
  const [reviewer, setReviewer] = useState<ReviewReviewerKind>('sponsor')
  const [reviewerEmails, setReviewerEmails] = useState(defaultReviewerEmails.join(', '))
  const [dueInDays, setDueInDays] = useState(14)
  const [recurrence, setRecurrence] = useState<ReviewRecurrence>('once')
  const [noResponse, setNoResponse] = useState<ReviewNoResponseAction>('keep')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const scopeCount = scope === 'selected' ? selectedGuestIds.length : (scopeCounts?.[scope] ?? 0)
  const defaultName = `${REVIEW_SCOPE_LABELS[scope].label} · ${new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`

  const canNext = step === 0 ? scopeCount > 0 : step === 1 ? reviewer !== 'admin' || reviewerEmails.trim().length > 0 || defaultReviewerEmails.length > 0 : true

  const submit = () => {
    startTransition(async () => {
      const res = await createAccessReview({
        name: name.trim() || defaultName,
        description,
        dueInDays,
        guestIds: scope === 'selected' ? selectedGuestIds : [],
        reviewerEmails,
        scopeKind: scope,
        reviewerKind: reviewer,
        recurrence,
        noResponseAction: noResponse,
      })
      if (res.ok) {
        toast.success(res.message)
        setOpen(false)
        if (res.reviewId) router.push(`/reviews/${res.reviewId}`)
      } else toast.error(res.error)
    })
  }

  const OptionCard = <T extends string>({ value, current, onSelect, label, description, meta }: { value: T; current: T; onSelect: (v: T) => void; label: string; description: string; meta?: ReactNode }) => {
    const active = value === current
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => onSelect(value)}
        className={cn(
          'flex w-full items-start gap-3 rounded-md border p-3 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50',
          active && 'border-primary bg-primary/5',
        )}
      >
        <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{active && <Check className="size-3" />}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center justify-between gap-2 text-sm">
            {label}
            {meta}
          </span>
          <span className="text-muted-foreground text-xs leading-relaxed">{description}</span>
        </span>
      </button>
    )
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger ?? (
        <Button onClick={() => setOpen(true)}>
          <Plus data-icon="inline-start" /> New access review
        </Button>
      )}
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>New access review</SheetTitle>
          <SheetDescription>Reviews are recorded in AIGIS and the audit log. They are not Entra ID Governance access reviews and do not require an Entra ID P2 license.</SheetDescription>
          <ol className="mt-2 flex items-center gap-1 text-xs" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <span className={cn('tnum rounded-sm px-1.5 py-0.5 font-mono', i === step ? 'bg-primary text-primary-foreground' : i < step ? 'text-foreground' : 'text-muted-foreground')}>{i + 1}</span>
                <span className={cn(i === step ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
                {i < STEPS.length - 1 && <span className="mx-1 text-muted-foreground">/</span>}
              </li>
            ))}
          </ol>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {step === 0 && (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Scope">
              {hasSelection && (
                <OptionCard value="selected" current={scope} onSelect={setScope} label={REVIEW_SCOPE_LABELS.selected.label} description={REVIEW_SCOPE_LABELS.selected.description} meta={<Badge variant="outline" className="tnum font-mono">{formatNumber(selectedGuestIds.length)}</Badge>} />
              )}
              {scopeCounts && (
                <>
                  <OptionCard value="high_critical" current={scope} onSelect={setScope} label={REVIEW_SCOPE_LABELS.high_critical.label} description={REVIEW_SCOPE_LABELS.high_critical.description} meta={<Badge variant="outline" className="tnum font-mono">{formatNumber(scopeCounts.high_critical)}</Badge>} />
                  <OptionCard value="all_external" current={scope} onSelect={setScope} label={REVIEW_SCOPE_LABELS.all_external.label} description={REVIEW_SCOPE_LABELS.all_external.description} meta={<Badge variant="outline" className="tnum font-mono">{formatNumber(scopeCounts.all_external)}</Badge>} />
                </>
              )}
              {!hasSelection && scopeCounts && (
                <p className="text-muted-foreground text-xs">
                  To review a hand-picked set, tick identities on{' '}
                  <Link href="/guests" className="text-foreground underline-offset-4 hover:underline">
                    External identities
                  </Link>{' '}
                  and start the review from there.
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Reviewers">
                {(Object.keys(REVIEW_REVIEWER_LABELS) as ReviewReviewerKind[]).map((k) => (
                  <OptionCard key={k} value={k} current={reviewer} onSelect={setReviewer} label={REVIEW_REVIEWER_LABELS[k].label} description={REVIEW_REVIEWER_LABELS[k].description} />
                ))}
              </div>
              <Field>
                <FieldLabel htmlFor="wizard-reviewers">{reviewer === 'admin' ? 'Administrator reviewers' : 'Fallback reviewers'}</FieldLabel>
                <Input id="wizard-reviewers" value={reviewerEmails} onChange={(e) => setReviewerEmails(e.target.value)} placeholder="name@yourtenant.com, other@yourtenant.com" />
                <FieldDescription>
                  {reviewer === 'admin' ? 'Who receives every item in this review.' : 'Used when a guest has no sponsor or the sponsor is disabled.'}
                  {defaultReviewerEmails.length > 0 && ' Pre-filled from Settings › Review workflow.'}
                </FieldDescription>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="wizard-due">Due in (days)</FieldLabel>
                  <Input id="wizard-due" type="number" min={1} max={90} value={dueInDays} onChange={(e) => setDueInDays(Math.max(1, Math.min(90, Number(e.target.value) || 14)))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="wizard-recurrence">Recurrence</FieldLabel>
                  <Select value={recurrence} onValueChange={(v) => v && setRecurrence(v as ReviewRecurrence)}>
                    <SelectTrigger id="wizard-recurrence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(REVIEW_RECURRENCE_LABELS) as ReviewRecurrence[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {REVIEW_RECURRENCE_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {recurrence !== 'once' && <p className="text-muted-foreground text-xs">Recurrence is recorded on the review. Automatic re-creation on the schedule is not active yet; the next cycle is started manually from this page.</p>}
              <div className="flex flex-col gap-2">
                <span className="text-sm">If reviewers do not respond by the due date</span>
                <div className="flex flex-col gap-2" role="radiogroup" aria-label="No-response action">
                  {(Object.keys(REVIEW_NO_RESPONSE_LABELS) as ReviewNoResponseAction[]).map((k) => (
                    <OptionCard key={k} value={k} current={noResponse} onSelect={setNoResponse} label={REVIEW_NO_RESPONSE_LABELS[k].label} description={REVIEW_NO_RESPONSE_LABELS[k].description} />
                  ))}
                </div>
                <p className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs leading-relaxed">
                  <span className="text-warning">Preview only.</span> AIGIS is running monitor-only. No-response outcomes are recorded and shown as recommendations; nothing is removed from Entra without an administrator approving it in the remediation
                  queue.
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="wizard-name">Review name</FieldLabel>
                <Input id="wizard-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
              </Field>
              <Field>
                <FieldLabel htmlFor="wizard-desc">Description (optional)</FieldLabel>
                <Textarea id="wizard-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this review is being run; shown to reviewers." />
              </Field>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border p-3 text-xs">
                <dt className="text-muted-foreground">Scope</dt>
                <dd>
                  {REVIEW_SCOPE_LABELS[scope].label} · <span className="tnum font-mono">{formatNumber(scopeCount)}</span> identities
                </dd>
                <dt className="text-muted-foreground">Reviewers</dt>
                <dd>
                  {REVIEW_REVIEWER_LABELS[reviewer].label}
                  {reviewerEmails.trim() && <span className="font-mono text-muted-foreground"> · {reviewerEmails}</span>}
                </dd>
                <dt className="text-muted-foreground">Due</dt>
                <dd>
                  <span className="tnum font-mono">{dueInDays}</span> days · {REVIEW_RECURRENCE_LABELS[recurrence]}
                </dd>
                <dt className="text-muted-foreground">No response</dt>
                <dd>{REVIEW_NO_RESPONSE_LABELS[noResponse].label} (recorded only)</dd>
              </dl>
            </div>
          )}
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
            <ArrowLeft data-icon="inline-start" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Next <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Create review
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
