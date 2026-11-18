'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateAiSettings } from '@/lib/actions/settings'

export function AiSettingsForm({ initialEnabled, disabled }: { initialEnabled: boolean; disabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="ai-explain">On-demand explanations</Label>
        <span className="text-muted-foreground text-xs">
          When on, analysts can ask for a written explanation of the current recommendation. It never changes Entra access
          and does not switch enforcement mode. Apply still needs a human with remediation permission.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant={enabled ? 'secondary' : 'outline'}>{enabled ? 'On demand' : 'Off'}</Badge>
        <Switch
          id="ai-explain"
          checked={enabled}
          disabled={disabled || pending}
          onCheckedChange={(next) =>
            startTransition(async () => {
              const res = await updateAiSettings(next)
              if (res.ok) {
                setEnabled(next)
                toast.success(next ? 'AI explanations enabled (on demand).' : 'AI explanations turned off.')
              } else {
                toast.error(res.error)
              }
            })
          }
        />
      </div>
    </div>
  )
}
