'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { approvePendingRemediation } from '@/lib/actions/remediation'

export function ApproveRemediationButton({ actionId }: { actionId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await approvePendingRemediation(actionId)
          if (res.ok) {
            toast.success(res.message)
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
      {pending ? 'Executing…' : 'Approve & execute'}
    </Button>
  )
}
