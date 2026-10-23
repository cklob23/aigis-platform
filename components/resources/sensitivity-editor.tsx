'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { setResourceSensitivity } from '@/lib/actions/settings'
import { SENSITIVITY_LABELS, type SensitivityCategory } from '@/lib/types'

export function SensitivityEditor({ resourceId, isSensitive, category }: { resourceId: string; isSensitive: boolean; category: SensitivityCategory | null }) {
  const [on, setOn] = useState(isSensitive)
  const [cat, setCat] = useState<SensitivityCategory>(category ?? 'other')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const dirty = on !== isSensitive || (on && cat !== category)

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2">
        <Switch id="sens" checked={on} onCheckedChange={setOn} />
        <Label htmlFor="sens">Sensitive resource</Label>
      </div>
      {on && (
        <Select items={SENSITIVITY_LABELS} value={cat} onValueChange={(v) => setCat(v as SensitivityCategory)}>
          <SelectTrigger size="sm" className="w-36" aria-label="Sensitivity category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SENSITIVITY_LABELS) as SensitivityCategory[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SENSITIVITY_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        size="sm"
        disabled={!dirty || pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setResourceSensitivity(resourceId, on, on ? cat : null)
            if (res.ok) {
              toast.success(res.message)
              router.refresh()
            } else toast.error(res.error)
          })
        }
      >
        {pending ? 'Saving…' : 'Save'}
      </Button>
      <span className="text-muted-foreground text-xs">Overrides the keyword heuristic and re-scores affected guests.</span>
    </div>
  )
}
