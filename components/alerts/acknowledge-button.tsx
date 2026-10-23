'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { acknowledgeAlert } from '@/lib/actions/governance'

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await acknowledgeAlert(alertId)
          if (res.ok) router.refresh()
          else toast.error(res.error)
        })
      }
    >
      Acknowledge
    </Button>
  )
}
