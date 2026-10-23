'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { sendTestEmail, updateEmailSettings } from '@/lib/actions/alerts'

type Props = {
  initial: { senderUpn: string; replyTo: string }
  sessionEmail: string
  disabled: boolean
  isDemo: boolean
  consentHref: string | null
  /** Deep link to the app registration's API permissions blade in Entra. */
  entraHref: string | null
  /** Live read of the app-only token's `roles` claim; null when unknown (demo tenant or token fetch failed). */
  mailSendGranted: boolean | null
  /** Outcome of a consent round-trip that just redirected back here. */
  consentResult: 'granted' | 'denied' | null
  lastDelivery: { status: string; error: string | null; created_at: string } | null
}

export function EmailDeliveryCard({ initial, sessionEmail, disabled, isDemo, consentHref, entraHref, mailSendGranted, consentResult, lastDelivery }: Props) {
  const [v, setV] = useState(initial)
  const [testTo, setTestTo] = useState(sessionEmail)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const router = useRouter()
  const deliveryDenied = lastDelivery?.status === 'failed' && /Mail\.Send|refused|Access.*denied/i.test(lastDelivery.error ?? '')
  const notGranted = mailSendGranted === false || (mailSendGranted === null && deliveryDenied)
  const consentedWithoutRole = consentResult === 'granted' && mailSendGranted === false

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="sender">Sender mailbox (UPN)</FieldLabel>
          <Input id="sender" placeholder="aigis-alerts@contoso.com" value={v.senderUpn} onChange={(e) => setV({ ...v, senderUpn: e.target.value })} disabled={disabled} autoComplete="off" />
          <FieldDescription>A licensed user or shared mailbox in your tenant. Messages are sent through Microsoft Graph as this account.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="replyto">Reply-to (optional)</FieldLabel>
          <Input id="replyto" placeholder="security@contoso.com" value={v.replyTo} onChange={(e) => setV({ ...v, replyTo: e.target.value })} disabled={disabled} autoComplete="off" />
          <FieldDescription>Where replies to alerts and review notices should land.</FieldDescription>
        </Field>
      </div>

      <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Required Graph permission</span>
          <Badge variant="outline" className="font-mono text-xs">
            Mail.Send
          </Badge>
          <Badge variant="outline" className="text-xs">
            Application
          </Badge>
          {mailSendGranted === true && <Badge className="bg-success text-success-foreground">Granted</Badge>}
          {notGranted && <Badge variant="destructive">Not granted</Badge>}
          {mailSendGranted === null && !deliveryDenied && !isDemo && (
            <Badge variant="outline" className="text-muted-foreground text-xs">
              Unknown
            </Badge>
          )}
        </div>

        {consentedWithoutRole && (
          <p className="text-destructive text-xs leading-relaxed" role="alert">
            Admin consent completed, but the token still does not include <span className="font-mono">Mail.Send</span>. Consent can only approve permissions that are already declared on the app
            registration — it never adds new ones. Add the permission in Entra first (step 1), then re-run consent.
          </p>
        )}

        {mailSendGranted === true ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            The app-only token includes <span className="font-mono">Mail.Send</span>. To restrict which mailboxes the app can send from, create an Exchange Online application access policy
            scoped to the sender above.
          </p>
        ) : (
          <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-4 text-xs leading-relaxed">
            <li>
              In Entra admin center, open the AIGIS app registration → <span className="font-medium">API permissions</span> → <span className="font-medium">Add a permission</span> →{' '}
              <span className="font-medium">Microsoft Graph</span> → <span className="font-medium">Application permissions</span> → tick <span className="font-mono">Mail.Send</span> → Add.
            </li>
            <li>Re-run admin consent below so the newly declared permission is granted to the tenant and included in the app-only token.</li>
            <li>Send a test email. The status above is read live from the token, so it updates on the next page load.</li>
          </ol>
        )}

        {(consentHref || entraHref) && (
          <div className="flex flex-wrap gap-2">
            {entraHref && (
              <Button size="sm" variant="outline" nativeButton={false} render={<a href={entraHref} target="_blank" rel="noopener noreferrer" />}>
                Open API permissions in Entra
              </Button>
            )}
            {consentHref && (
              <Button size="sm" variant={mailSendGranted === true ? 'ghost' : 'outline'} nativeButton={false} render={<a href={consentHref} target="_top" />}>
                Re-run admin consent
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button
          size="sm"
          disabled={disabled || saving}
          onClick={() =>
            startSave(async () => {
              const res = await updateEmailSettings(v)
              if (res.ok) {
                toast.success(res.message)
                router.refresh()
              } else toast.error(res.error)
            })
          }
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <div className="flex flex-1 flex-wrap items-end gap-2">
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor="test-to" className="text-xs">
              Send a test to
            </FieldLabel>
            <Input id="test-to" value={testTo} onChange={(e) => setTestTo(e.target.value)} disabled={disabled} />
          </Field>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || testing || (!isDemo && !initial.senderUpn)}
            onClick={() =>
              startTest(async () => {
                const res = await sendTestEmail(testTo)
                if (res.ok) toast.success(res.message)
                else toast.error(res.error)
                router.refresh()
              })
            }
          >
            {testing ? 'Sending…' : 'Send test email'}
          </Button>
        </div>
      </div>
      {!isDemo && !initial.senderUpn && <p className="text-muted-foreground text-xs">Save a sender mailbox before sending a test.</p>}
    </div>
  )
}
