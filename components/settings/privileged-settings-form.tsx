'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { recheckPrivilegedCapability, updatePrivilegedModule } from '@/lib/actions/settings'
import type { PrivilegedCapability, PrivilegedLicenseHint, PrivilegedPimStatus } from '@/lib/types'

export type PrivilegedPermissionRow = { name: string; granted: boolean }

const LICENSE_LABEL: Record<PrivilegedLicenseHint, string> = {
  p2: 'Entra ID P2',
  p1: 'Entra ID P1',
  governance: 'Entra ID Governance',
  none: 'No P2 license detected',
}

function pimShown(status: PrivilegedPimStatus): Exclude<PrivilegedPimStatus, 'unknown'> {
  if (status === 'available' || status === 'needs_consent') return status
  return 'unavailable'
}

function pimCopy(kind: 'directory' | 'groups', status: PrivilegedPimStatus): string {
  const shown = pimShown(status)
  if (kind === 'directory') {
    if (shown === 'available') return 'PIM for directory roles is available.'
    if (shown === 'needs_consent') return 'Admin consent is missing RoleManagement.Read.Directory.'
    if (status === 'unknown') return 'PIM for directory roles is not confirmed. Check again.'
    return 'PIM for directory roles is not available.'
  }
  if (shown === 'available') return 'PIM for groups is available.'
  if (shown === 'needs_consent') return 'Admin consent is missing PrivilegedEligibilitySchedule.Read.AzureADGroup.'
  if (status === 'unknown') return 'PIM for groups is not confirmed. Check again after a role-assignable group exists.'
  return 'PIM for groups is not available.'
}

function statusBadge(status: PrivilegedPimStatus) {
  const shown = pimShown(status)
  if (shown === 'available') return { label: 'Available', variant: 'secondary' as const }
  if (shown === 'needs_consent') return { label: 'Needs consent', variant: 'outline' as const }
  return { label: 'Unavailable', variant: 'outline' as const }
}

export function PrivilegedSettingsForm({
  initialEnabled,
  capability,
  permissions,
  consentHref,
  readOnly = false,
}: {
  initialEnabled: boolean
  capability: PrivilegedCapability | null
  permissions: PrivilegedPermissionRow[]
  consentHref: string | null
  readOnly?: boolean
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()
  const locked = readOnly || pending
  const dir = capability ? statusBadge(capability.pim) : null
  const missingConsent = permissions.some((p) => !p.granted)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="privileged-module">Privileged access module</Label>
          <span className="text-muted-foreground text-xs">
            Off by default. When on, AIGIS can probe PIM and related read permissions. Dashboard and Guests stay
            unchanged.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={enabled ? 'secondary' : 'outline'}>{enabled ? 'On' : 'Off'}</Badge>
          <Switch
            id="privileged-module"
            checked={enabled}
            disabled={locked}
            onCheckedChange={(next) => {
              if (readOnly) return
              startTransition(async () => {
                const res = await updatePrivilegedModule(next)
                if (res.ok) {
                  setEnabled(next)
                  toast.success(next ? 'Privileged access enabled.' : 'Privileged access turned off.')
                } else {
                  toast.error(res.error)
                }
              })
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-muted-foreground text-xs">Directory PIM</div>
            <div className="mt-0.5 flex items-center gap-2">
              {dir ? (
                <Badge variant={dir.variant} className={dir.label === 'Available' ? 'border-success/40 text-success' : undefined}>
                  {dir.label}
                </Badge>
              ) : (
                <Badge variant="outline">Not checked</Badge>
              )}
              <span className="text-muted-foreground text-xs">
                {capability ? pimCopy('directory', capability.pim) : 'Check again to probe Microsoft Graph. All probes are read-only.'}
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={locked}
            onClick={() => {
              if (readOnly) return
              startTransition(async () => {
                const res = await recheckPrivilegedCapability()
                if (res.ok) toast.success(res.message ?? 'Privileged capability rechecked.')
                else toast.error(res.error)
              })
            }}
          >
            Check again
          </Button>
        </div>
        {capability && (
          <p className="text-muted-foreground text-xs">{pimCopy('groups', capability.pim_groups)}</p>
        )}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">License hint</dt>
            <dd>{capability ? LICENSE_LABEL[capability.license_hint] : 'Not checked'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Sign-in activity</dt>
            <dd>{capability ? (capability.sign_in_activity ? 'Readable' : 'Not readable') : 'Not checked'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Authentication methods</dt>
            <dd>{capability ? (capability.auth_methods ? 'Readable' : 'Not readable') : 'Not checked'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Last checked</dt>
            <dd className="font-mono text-xs">
              {capability?.checked_at
                ? new Date(capability.checked_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'Not checked'}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <div className="mb-2 text-xs text-muted-foreground">Read permissions on the app-only token</div>
        <ul className="grid gap-1 rounded-md border bg-muted/30 p-3 font-mono text-xs">
          {permissions.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-3">
              <span>{p.name}</span>
              <Badge variant={p.granted ? 'secondary' : 'outline'}>{p.granted ? 'Granted' : 'Missing'}</Badge>
            </li>
          ))}
        </ul>
        {missingConsent && consentHref && (
          <Button className="mt-3" size="sm" variant="outline" nativeButton={false} render={<a href={consentHref} target="_top" />}>
            Grant admin consent
          </Button>
        )}
      </div>
    </div>
  )
}
