import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { microsoftConfigured } from '@/lib/env'
import { alertCountsByRule, listAlertRules, listEmailLog } from '@/lib/data/alerts'
import { emailSettingsOf } from '@/lib/email/mailer'
import { entraApiPermissionsUrl, getAppOnlyRoles } from '@/lib/auth/microsoft'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmailDeliveryCard } from '@/components/settings/email-delivery-card'
import { AlertRulesList } from '@/components/settings/alert-rules-list'
import { EmailLog } from '@/components/settings/email-log'
import { privilegedAlertsEnabled } from '@/lib/privileged/capability'

export const metadata = { title: 'Alert rules' }

export default async function AlertSettingsPage({ searchParams }: { searchParams: Promise<{ consent?: string }> }) {
  const { session, tenant } = await requireOnboarded()
  const { consent } = await searchParams
  const liveTenant = !tenant.is_demo && microsoftConfigured()
  const [rules, counts, log, roles] = await Promise.all([
    listAlertRules(tenant.id),
    alertCountsByRule(tenant.id),
    listEmailLog(tenant.id),
    liveTenant ? getAppOnlyRoles(tenant.ms_tenant_id, consent === 'granted').catch(() => null) : Promise.resolve(null),
  ])
  const email = emailSettingsOf(tenant)
  const canManageSettings = can(session.role, 'settings.manage')
  const canManageRules = can(session.role, 'policy.manage')
  const lastDelivery = log.find((e) => e.status !== 'skipped') ?? null
  const mailSendGranted = roles ? roles.includes('Mail.Send') : null
  const privilegedEnabled = privilegedAlertsEnabled(tenant.settings)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Email delivery</CardTitle>
          <CardDescription>Alerts and access review notices are sent through Microsoft Graph using the AIGIS app registration. No SMTP credentials are stored.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailDeliveryCard
            initial={{ senderUpn: email.sender_upn ?? '', replyTo: email.reply_to ?? '' }}
            sessionEmail={session.email}
            disabled={!canManageSettings}
            isDemo={tenant.is_demo}
            consentHref={liveTenant && canManageSettings ? '/api/auth/microsoft/consent?return=/settings/alerts' : null}
            entraHref={liveTenant ? entraApiPermissionsUrl() : null}
            mailSendGranted={mailSendGranted}
            consentResult={consent === 'granted' || consent === 'denied' ? consent : null}
            lastDelivery={lastDelivery ? { status: lastDelivery.status, error: lastDelivery.error, created_at: lastDelivery.created_at } : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alert rules</CardTitle>
          <CardDescription>Conditions evaluated after every scan and daily. New matches become alerts and are emailed to the recipients on the rule.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertRulesList
            rules={rules}
            counts={Object.fromEntries(counts)}
            canManage={canManageRules}
            privilegedEnabled={privilegedEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delivery log</CardTitle>
          <CardDescription>The most recent 25 outbound messages and their Graph result.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailLog entries={log} />
        </CardContent>
      </Card>
    </>
  )
}
