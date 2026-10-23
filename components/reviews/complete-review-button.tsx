'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeReview } from '@/lib/actions/governance'

export function CompleteReviewButton({ reviewId, pending }: { reviewId: string; pending: number }) {
  const [busy, startTransition] = useTransition()
  const router = useRouter()
  return (
    <Button
      disabled={pending > 0 || busy}
      onClick={() =>
        startTransition(async () => {
          const res = await completeReview(reviewId)
          if (res.ok) {
            toast.success(res.message)
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
      <CheckCheck data-icon="inline-start" />
      {pending > 0 ? `${pending} decisions remaining` : 'Complete review'}
    </Button>
  )
}
