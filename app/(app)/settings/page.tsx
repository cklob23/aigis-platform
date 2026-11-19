import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/supabase/admin'
import { microsoftConfigured } from '@/lib/env'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NotificationSettingsForm } from '@/components/settings/notification-settings-form'
import { EnforcementSwitch } from '@/components/settings/enforcement-switch'
import { AiSettingsForm } from '@/components/settings/ai-settings-form'
import { ResetDemoButton } from '@/components/settings/reset-demo-button'
import { formatDate } from '@/lib/format'
import { parseAiSettings } from '@/lib/ai/recommend'
import { parsePrivilegedSettings, grantedPrivilegedPermissions } from '@/lib/privileged/capability'
import { getAppOnlyRoles } from '@/lib/auth/microsoft'
import { PrivilegedSettingsForm } from '@/components/settings/privileged-settings-form'

export default async function GeneralSettingsPage({ searchParams }: { searchParams: Promise<{ consent?: string }> }) {
  const { session, tenant } = await requireOnboarded()
  const { consent } = await searchParams
  const { data: sub } = await db().from('subscriptions').select('*').eq('organization_id', tenant.organization_id).maybeSingle()
  const notifications = (tenant.settings.notifications as { email?: boolean; weekly_digest?: boolean }) ?? {}
  const canManage = can(session.role, 'settings.manage')
  const liveTenant = !tenant.is_demo && microsoftConfigured()
  const roles = canManage && liveTenant ? await getAppOnlyRoles(tenant.ms_tenant_id, consent === 'granted').catch(() => []) : []
  const privileged = parsePrivilegedSettings(tenant.settings)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tenant connection</CardTitle>
          <CardDescription>Microsoft Entra ID tenant linked to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground text-xs">Display name</dt>
              <dd>{tenant.display_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Tenant ID</dt>
              <dd className="font-mono text-xs">{tenant.ms_tenant_id}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Status</dt>
              <dd>
                <Badge variant="outline" className={tenant.connection_status === 'connected' ? 'border-success/40 text-success' : 'border-warning/40 text-warning'}>
                  {tenant.connection_status.replace('_', ' ')}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Admin consent</dt>
              <dd>{tenant.consent_granted_at ? formatDate(tenant.consent_granted_at, true) : 'Not granted'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Verified domains</dt>
              <dd className="font-mono text-xs">{tenant.verified_domains.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Last scan</dt>
              <dd>{formatDate(tenant.last_scan_at, true)}</dd>
            </div>
          </dl>
          {!tenant.is_demo && tenant.connection_status !== 'connected' && microsoftConfigured() && canManage && (
            <Button className="mt-4" nativeButton={false} render={<a href="/api/auth/microsoft/consent" target="_top" />}>
              Grant admin consent
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enforcement mode</CardTitle>
          <CardDescription>Controls whether AIGIS is allowed to make changes in your Entra ID tenant. New tenants start in monitor-only mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <EnforcementSwitch disabled={!canManage || tenant.is_demo} initial={tenant.settings.enforcement_mode === 'enforce' ? 'enforce' : 'monitor'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI explanations</CardTitle>
          <CardDescription>
            Off by default. Recommend and explain only. Enabling this flag does not change enforcement mode and never
            grants autonomous access changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AiSettingsForm disabled={!canManage} initialEnabled={parseAiSettings(tenant.settings).enabled} />
        </CardContent>
      </Card>

      {canManage && (
        <Card id="privileged">
          <CardHeader>
            <CardTitle>Privileged access</CardTitle>
            <CardDescription>Read-only. Turning this on doesn&apos;t change Dashboard or External identities.</CardDescription>
          </CardHeader>
          <CardContent>
            <PrivilegedSettingsForm
              initialEnabled={privileged.enabled}
              capability={privileged.capability}
              permissions={grantedPrivilegedPermissions(roles)}
              consentHref={liveTenant ? '/api/auth/microsoft/consent?return=/settings' : null}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Scan schedule & notifications</CardTitle>
          <CardDescription>Scheduled scans run via the platform cron; manual scans are always available to analysts.</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettingsForm
            disabled={!canManage}
            initial={{ email: notifications.email ?? true, weeklyDigest: notifications.weekly_digest ?? true, scanSchedule: ((tenant.settings.scan_schedule as string) ?? 'daily') as 'daily' | 'weekly' | 'manual' }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Plan</div>
            <div className="capitalize">{sub?.plan ?? 'trial'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Status</div>
            <div className="capitalize">{sub?.status ?? 'active'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Renews</div>
            <div>{formatDate(sub?.current_period_end)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Admin seats</div>
            <div>{sub?.seats ?? 1}</div>
          </div>
        </CardContent>
      </Card>

      {tenant.is_demo && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle>Demo tenant</CardTitle>
            <CardDescription>Regenerate the Northwind Health dataset to undo any classifications, reviews, or remediations made during exploration.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResetDemoButton />
          </CardContent>
        </Card>
      )}
    </>
  )
}
