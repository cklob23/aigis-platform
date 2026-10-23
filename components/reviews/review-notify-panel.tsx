'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BellRing, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendReviewReminder, updateReviewerEmails } from '@/lib/actions/governance'
import { formatDate } from '@/lib/format'

type Props = { reviewId: string; reviewerEmails: string[]; notifiedAt: string | null; lastReminderAt: string | null; canManage: boolean; active: boolean }

export function ReviewNotifyPanel({ reviewId, reviewerEmails, notifiedAt, lastReminderAt, canManage, active }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(reviewerEmails.join(', '))
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Mail className="size-4 text-muted-foreground" /> Reviewers
        </span>
        {editing ? (
          <div className="flex flex-wrap gap-2">
            <Input value={value} onChange={(e) => setValue(e.target.value)} className="min-w-64 flex-1" placeholder="owner@contoso.com, manager@contoso.com" />
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await updateReviewerEmails({ reviewId, reviewerEmails: value })
                  if (res.ok) {
                    toast.success(res.message)
                    setEditing(false)
                    router.refresh()
                  } else toast.error(res.error)
                })
              }
            >
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground font-mono text-xs">{reviewerEmails.length ? reviewerEmails.join(', ') : 'No reviewers assigned — sponsors are used if enabled in Settings.'}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {notifiedAt ? `Assigned ${formatDate(notifiedAt, true)}` : 'Not yet notified'}
          {lastReminderAt && ` · last reminder ${formatDate(lastReminderAt, true)}`}
        </p>
      </div>
      {canManage && !editing && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit reviewers
          </Button>
          {active && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await sendReviewReminder(reviewId)
                  if (res.ok) toast.success(res.message)
                  else toast.error(res.error)
                  router.refresh()
                })
              }
            >
              <BellRing data-icon="inline-start" /> {pending ? 'Sending…' : 'Send reminder'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
