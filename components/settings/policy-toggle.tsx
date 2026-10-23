'use client'

import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { togglePolicy } from '@/lib/actions/settings'

export function PolicyToggle({ policyId, enabled, disabled }: { policyId: string; enabled: boolean; disabled: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled)
  const [, startTransition] = useTransition()
  return (
    <Switch
      checked={optimistic}
      disabled={disabled}
      aria-label="Enable rule"
      onCheckedChange={(next) =>
        startTransition(async () => {
          setOptimistic(next)
          const res = await togglePolicy(policyId, next)
          if (!res.ok) toast.error(res.error)
        })
      }
    />
  )
}
