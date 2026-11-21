'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { recheckPrivilegedCapability } from '@/lib/actions/settings'

export function PimRecheckButton({ canRecheck }: { canRecheck: boolean }) {
  const [pending, startTransition] = useTransition()
  if (!canRecheck) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await recheckPrivilegedCapability()
          if (res.ok) toast.success(res.message ?? 'Privileged capability rechecked.')
          else toast.error(res.error)
        })
      }}
    >
      Check again
    </Button>
  )
}
