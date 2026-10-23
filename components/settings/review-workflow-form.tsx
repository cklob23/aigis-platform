'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { updateReviewWorkflow } from '@/lib/actions/governance'
import type { ReviewWorkflowSettings } from '@/lib/types'

type FormState = Omit<ReviewWorkflowSettings, 'approver_emails' | 'default_reviewer_emails'> & { approver_emails: string; default_reviewer_emails: string }

export function ReviewWorkflowForm({ initial, disabled }: { initial: ReviewWorkflowSettings; disabled: boolean }) {
  const [v, setV] = useState<FormState>({ ...initial, approver_emails: initial.approver_emails.join(', '), default_reviewer_emails: initial.default_reviewer_emails.join(', ') })
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="require-approval">Require administrator approval</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">New reviews created by analysts start as drafts until an approver signs off. Approvers and administrators skip this step for their own reviews.</p>
          </div>
          <Switch id="require-approval" checked={v.require_approval} onCheckedChange={(c) => setV({ ...v, require_approval: c })} disabled={disabled} />
        </div>
        <Field>
          <FieldLabel htmlFor="approvers">Approver emails</FieldLabel>
          <Textarea id="approvers" rows={2} value={v.approver_emails} onChange={(e) => setV({ ...v, approver_emails: e.target.value })} placeholder="ciso@contoso.com, iam-lead@contoso.com" disabled={disabled} />
          <FieldDescription>These people receive approval requests and can approve or reject from Settings or the review page. Match the email they sign in to AIGIS with.</FieldDescription>
        </Field>
      </section>

      <section className="flex flex-col gap-4 border-t pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="notify-reviewers">Email reviewers when a review becomes active</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">Sends an assignment notice with scope, due date and a link to the review.</p>
          </div>
          <Switch id="notify-reviewers" checked={v.notify_reviewers} onCheckedChange={(c) => setV({ ...v, notify_reviewers: c })} disabled={disabled} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="notify-sponsors">Also notify each identity&apos;s sponsor</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">Adds active sponsors from Entra ID to the reviewer list so business owners certify their own guests.</p>
          </div>
          <Switch id="notify-sponsors" checked={v.notify_sponsors} onCheckedChange={(c) => setV({ ...v, notify_sponsors: c })} disabled={disabled} />
        </div>
        <Field>
          <FieldLabel htmlFor="default-reviewers">Default reviewers</FieldLabel>
          <Textarea id="default-reviewers" rows={2} value={v.default_reviewer_emails} onChange={(e) => setV({ ...v, default_reviewer_emails: e.target.value })} placeholder="access-governance@contoso.com" disabled={disabled} />
          <FieldDescription>Used when a review is created without explicit reviewers.</FieldDescription>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="reminder-days">Remind reviewers (days before due)</FieldLabel>
            <Input id="reminder-days" type="number" min={0} max={30} className="w-32" value={v.reminder_days_before_due} onChange={(e) => setV({ ...v, reminder_days_before_due: Number(e.target.value) })} disabled={disabled} />
            <FieldDescription>Daily reminders start this many days before the due date and continue while decisions are pending. 0 reminds only once overdue.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="due-days">Default due window (days)</FieldLabel>
            <Input id="due-days" type="number" min={1} max={90} className="w-32" value={v.default_due_days} onChange={(e) => setV({ ...v, default_due_days: Number(e.target.value) })} disabled={disabled} />
          </Field>
        </div>
      </section>

      <div>
        <Button
          size="sm"
          disabled={disabled || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateReviewWorkflow({ ...v, approver_emails: v.approver_emails.split(/[,;\s]+/), default_reviewer_emails: v.default_reviewer_emails.split(/[,;\s]+/) })
              if (res.ok) {
                toast.success(res.message)
                router.refresh()
              } else toast.error(res.error)
            })
          }
        >
          {pending ? 'Saving…' : 'Save workflow'}
        </Button>
      </div>
    </div>
  )
}
