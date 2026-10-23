'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ShieldAlertIcon, ShieldCheckIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { updateEnforcementMode } from '@/lib/actions/settings'

export function EnforcementSwitch({ initial, disabled }: { initial: 'monitor' | 'enforce'; disabled: boolean }) {
  const [mode, setMode] = useState(initial)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  const apply = (next: 'monitor' | 'enforce') =>
    startTransition(async () => {
      const res = await updateEnforcementMode(next)
      if (res.ok) {
        setMode(next)
        toast.success(next === 'enforce' ? 'Enforcement enabled. Approved remediations will now change Entra.' : 'Switched to monitor-only mode.')
      } else {
        toast.error(res.error)
      }
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {mode === 'enforce' ? <ShieldAlertIcon className="text-destructive size-5" /> : <ShieldCheckIcon className="text-muted-foreground size-5" />}
          <div className="flex flex-col">
            <Label htmlFor="enforce">Enforcement</Label>
            <span className="text-muted-foreground text-xs">
              {mode === 'enforce'
                ? 'Approved remediations remove access, disable, or delete guests in Entra ID.'
                : 'Monitor-only. Scans read your tenant; remediations are queued but nothing is changed in Entra.'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={mode === 'enforce' ? 'destructive' : 'secondary'}>{mode === 'enforce' ? 'Enforcing' : 'Monitor only'}</Badge>
          <Switch
            id="enforce"
            checked={mode === 'enforce'}
            disabled={disabled || pending}
            onCheckedChange={(checked) => (checked ? setConfirming(true) : apply('monitor'))}
          />
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enable enforcement?</AlertDialogTitle>
            <AlertDialogDescription>
              Once enabled, approved remediation actions will call Microsoft Graph to remove group memberships, disable accounts,
              revoke sessions, or delete guest users. This requires the ReadWrite application permissions to be consented. Every
              action is still logged with the actor, reason, and correlation ID.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep monitor-only</AlertDialogCancel>
            <AlertDialogAction onClick={() => apply('enforce')}>Enable enforcement</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
