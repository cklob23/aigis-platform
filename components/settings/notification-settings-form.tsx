'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateNotificationSettings } from '@/lib/actions/settings'

type Values = { email: boolean; weeklyDigest: boolean; scanSchedule: 'daily' | 'weekly' | 'manual' }

export function NotificationSettingsForm({ initial, disabled }: { initial: Values; disabled: boolean }) {
  const [v, setV] = useState(initial)
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="sched" className="w-48">
          Scan schedule
        </Label>
        <Select items={{ daily: 'Daily', weekly: 'Weekly', manual: 'Manual only' }} value={v.scanSchedule} onValueChange={(s) => setV({ ...v, scanSchedule: s as Values['scanSchedule'] })} disabled={disabled}>
          <SelectTrigger id="sched" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="manual">Manual only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor="email" className="w-48">
          Email alerts for critical findings
        </Label>
        <Switch id="email" checked={v.email} onCheckedChange={(c) => setV({ ...v, email: c })} disabled={disabled} />
      </div>
      <div className="flex items-center gap-3">
        <Label htmlFor="digest" className="w-48">
          Weekly posture digest
        </Label>
        <Switch id="digest" checked={v.weeklyDigest} onCheckedChange={(c) => setV({ ...v, weeklyDigest: c })} disabled={disabled} />
      </div>
      <div>
        <Button
          size="sm"
          disabled={disabled || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await updateNotificationSettings(v)
              if (res.ok) toast.success(res.message)
              else toast.error(res.error)
            })
          }
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
