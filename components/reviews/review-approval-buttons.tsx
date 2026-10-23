'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import { approveReview, rejectReview } from '@/lib/actions/governance'

export function ReviewApprovalButtons({ reviewId, reviewName, size = 'sm' }: { reviewId: string; reviewName: string; size?: 'sm' | 'default' }) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const run = () => {
    const which = mode
    if (!which) return
    startTransition(async () => {
      const res = which === 'approve' ? await approveReview({ reviewId, note }) : await rejectReview({ reviewId, note })
      if (res.ok) {
        toast.success(res.message)
        setMode(null)
        setNote('')
        router.refresh()
      } else toast.error(res.error)
    })
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size={size} onClick={() => setMode('approve')}>
          Approve
        </Button>
        <Button size={size} variant="outline" onClick={() => setMode('reject')}>
          Reject
        </Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === 'approve' ? 'Approve' : 'Reject'} “{reviewName}”</DialogTitle>
            <DialogDescription>{mode === 'approve' ? 'The review becomes active and reviewers are emailed.' : 'The review is cancelled and the requester is notified. Identities return to their previous review status.'}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="approval-note">Note (optional)</FieldLabel>
            <Textarea id="approval-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'approve' ? 'Scope confirmed with the data owner.' : 'Scope is too broad — split by organization.'} />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
            <Button variant={mode === 'reject' ? 'destructive' : 'default'} onClick={run} disabled={pending}>
              {pending ? 'Working…' : mode === 'approve' ? 'Approve review' : 'Reject review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
