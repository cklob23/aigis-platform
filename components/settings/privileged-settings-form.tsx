'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Info } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { recheckPrivilegedCapability, updatePrivilegedModule } from '@/lib/actions/settings'
import { formatCheckedAt } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PrivilegedCapability, PrivilegedLicenseHint, PrivilegedPimStatus } from '@/lib/types'

export type PrivilegedPermissionRow = { name: string; granted: boolean }

const LICENSE_LABEL: Record<PrivilegedLicenseHint, string> = {
  p2: 'Entra ID P2',
  p1: 'Entra ID P1',
  governance: 'Entra ID Governance',
  none: 'No P2 license detected',
}

const AUTH_METHODS_PERM = 'UserAuthenticationMethod.Read.All'

const badgeTone = {
  ok: 'border-success/40 bg-success/10 text-success',
  warn: 'border-warning/40 bg-warning/10 text-warning',
  muted: 'border-border bg-muted text-muted-foreground',
}

function StatusBadge({ tone, children }: { tone: keyof typeof badgeTone; children: string }) {
  return (
    <Badge variant="outline" className={badgeTone[tone]}>
      {children}
    </Badge>
  )
}

function pimBadge(status: PrivilegedPimStatus): { label: string; tone: keyof typeof badgeTone } {
  if (status === 'available') return { label: 'Available', tone: 'ok' }
  if (status === 'needs_consent') return { label: 'Needs consent', tone: 'warn' }
  if (status === 'unknown') return { label: 'Unknown', tone: 'muted' }
  return { label: 'Unavailable', tone: 'muted' }
}

function authMethodsCopy(capability: PrivilegedCapability, permissions: PrivilegedPermissionRow[]): string {
  const granted = permissions.some((p) => p.name === AUTH_METHODS_PERM && p.granted)
  if (granted && capability.auth_methods) return 'Readable'
  if (granted && !capability.auth_methods) {
    return 'Microsoft Graph returned 403 for authentication methods.'
  }
  return 'Permission not granted'
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
  const missingCount = permissions.filter((p) => !p.granted).length
  const needsConsent = enabled && capability?.pim === 'needs_consent'
  const showP2Info =
    enabled &&
    capability &&
    capability.pim !== 'available' &&
    capability.pim !== 'needs_consent' &&
    capability.license_hint !== 'p2'
  const checked = capability?.checked_at ? formatCheckedAt(capability.checked_at) : null
  const dir = capability ? pimBadge(capability.pim) : null
  const unknownUntilConsent = 'Unknown until consent is granted'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="privileged-module">Privileged access module</Label>
          <span className="text-muted-foreground text-xs">Checks Microsoft Graph for role, PIM, and sign-in data.</span>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge tone={enabled ? 'ok' : 'muted'}>{enabled ? 'On' : 'Off'}</StatusBadge>
          <Switch
            id="privileged-module"
            checked={enabled}
            disabled={pending}
            onCheckedChange={(next) => {
              if (readOnly) {
                setEnabled(next)
                return
              }
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

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!enabled || pending}
          className={cn(!enabled && 'opacity-50')}
          onClick={() => {
            if (readOnly || !enabled) return
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

      {enabled && (
        <>
          {showP2Info && (
            <Alert>
              <Info />
              <AlertTitle>PIM is not available on this tenant</AlertTitle>
              <AlertDescription>
                PIM needs Entra ID P2. Role assignments still show, but eligible vs active and activation history
                won&apos;t.
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Directory PIM</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                {dir ? (
                  <StatusBadge tone={dir.tone}>{dir.label}</StatusBadge>
                ) : (
                  <StatusBadge tone="muted">Not checked</StatusBadge>
                )}
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">License hint</dt>
                <dd>{needsConsent ? unknownUntilConsent : capability ? LICENSE_LABEL[capability.license_hint] : 'Not checked'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Sign-in activity</dt>
                <dd>
                  {needsConsent
                    ? unknownUntilConsent
                    : capability
                      ? capability.sign_in_activity
                        ? 'Readable'
                        : 'Not readable'
                      : 'Not checked'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Authentication methods</dt>
                <dd>
                  {needsConsent ? unknownUntilConsent : capability ? authMethodsCopy(capability, permissions) : 'Not checked'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Last checked</dt>
                <dd className="text-xs">
                  {checked ? (
                    <span title={checked.title}>{checked.label}</span>
                  ) : (
                    'Not checked'
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <div className="mb-2 text-xs text-muted-foreground">Read permissions AIGIS needs</div>
            {needsConsent ? (
              <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                <p>
                  Admin consent needed for {missingCount} read permission{missingCount === 1 ? '' : 's'}.
                </p>
                {consentHref && (
                  <div>
                    <Button nativeButton={false} render={<a href={consentHref} target="_top" />}>
                      Grant admin consent
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="grid gap-1 rounded-md border bg-muted/30 p-3 font-mono text-xs">
                {permissions.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3">
                    <span>{p.name}</span>
                    <StatusBadge tone={p.granted ? 'ok' : 'warn'}>{p.granted ? 'Granted' : 'Missing'}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
