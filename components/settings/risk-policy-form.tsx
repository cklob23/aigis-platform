'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { updateRiskPolicy } from '@/lib/actions/settings'
import type { RiskPolicyConfig } from '@/lib/risk/engine'

export function RiskPolicyForm({ initial, disabled }: { initial: RiskPolicyConfig; disabled: boolean }) {
  const [v, setV] = useState(initial)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const field = (key: keyof RiskPolicyConfig, label: string, desc: string) => (
    <Field>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input id={key} type="number" min={7} max={1095} value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) })} disabled={disabled} className="w-32" />
      <FieldDescription>{desc}</FieldDescription>
    </Field>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {field('inactiveDays', 'Inactive after (days)', 'Adds risk once a guest has no sign-in for this long.')}
        {field('staleDays', 'Stale after (days)', 'Stronger penalty; drives disable/remove recommendations.')}
        {field('reviewDays', 'Review every (days)', 'Guests without a decision in this window are flagged.')}
      </div>
      <div>
        <Button
          size="sm"
          disabled={disabled || pending || v.inactiveDays >= v.staleDays}
          onClick={() =>
            startTransition(async () => {
              const res = await updateRiskPolicy(v)
              if (res.ok) {
                toast.success(res.message)
                router.refresh()
              } else toast.error(res.error)
            })
          }
        >
          {pending ? 'Re-scoring…' : 'Save and re-score'}
        </Button>
        {v.inactiveDays >= v.staleDays && <span className="ml-3 text-destructive text-xs">Stale threshold must exceed inactive threshold.</span>}
      </div>
    </div>
  )
}
