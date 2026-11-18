import 'server-only'
import { headers } from 'next/headers'
import { db } from '@/lib/supabase/admin'
import { env } from '@/lib/env'
import { GraphClient, GraphError } from '@/lib/graph/client'
import type { EmailSettings } from '@/lib/types'
import { mustWrite, WriteFailedError } from '@/lib/supabase/write'

export type MailTenant = {
  id: string
  ms_tenant_id: string
  display_name: string
  is_demo: boolean
  settings: Record<string, unknown>
}

export type OutboundMail = {
  kind: string
  to: string[]
  cc?: string[]
  subject: string
  html: string
  relatedType?: string
  relatedId?: string
}

export type SendResult = { ok: true; skipped?: boolean } | { ok: false; error: string; code?: string }

export function emailSettingsOf(tenant: Pick<MailTenant, 'settings'>): EmailSettings {
  const raw = (tenant.settings?.email as Partial<EmailSettings> | undefined) ?? {}
  return { sender_upn: raw.sender_upn ?? null, reply_to: raw.reply_to ?? null }
}

/**
 * Public origin for links inside emails. Background work (cron, `after()`) has
 * no request headers, so explicit configuration wins and headers are a fallback.
 */
export async function publicOrigin() {
  if (env.microsoftRedirectUri) return new URL(env.microsoftRedirectUri).origin
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  try {
    const h = await headers()
    const proto = h.get('x-forwarded-proto') ?? 'https'
    const host = h.get('x-forwarded-host') ?? h.get('host')
    if (host) return `${proto}://${host}`
  } catch {
    // Not in a request scope.
  }
  return ''
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeEmails(input: string | string[] | null | undefined): string[] {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[,;\s]+/)
  const out = new Set<string>()
  for (const raw of list) {
    const e = raw.trim().toLowerCase()
    if (e && EMAIL_RE.test(e)) out.add(e)
  }
  return Array.from(out)
}

function friendlyGraphError(err: unknown): { error: string; code?: string } {
  if (err instanceof GraphError) {
    if (err.status === 403 || err.code === 'ErrorAccessDenied') {
      return { code: err.code ?? 'ErrorAccessDenied', error: 'Microsoft Graph refused to send mail. Grant the Mail.Send application permission to the AIGIS app registration and re-run admin consent.' }
    }
    if (err.status === 404 || err.code === 'ErrorInvalidUser' || err.code === 'ResourceNotFound') {
      return { code: err.code, error: 'The sender mailbox was not found in this tenant. Use the UPN of a licensed mailbox (a shared mailbox works too).' }
    }
    if (err.code === 'MailboxNotEnabledForRESTAPI' || err.code === 'MailboxNotSupportedForRESTAPI') {
      return { code: err.code, error: 'The sender account has no Exchange Online mailbox. Choose a mailbox-enabled user or shared mailbox.' }
    }
    return { code: err.code, error: err.message }
  }
  return { error: err instanceof Error ? err.message : 'Failed to send email' }
}

/**
 * Send one message through Microsoft Graph as the tenant's configured sender
 * mailbox, using the app-only token from the AIGIS app registration
 * (requires the Mail.Send application permission). Every attempt is written
 * to `email_log`.
 */
export async function sendMail(tenant: MailTenant, mail: OutboundMail): Promise<SendResult> {
  const supabase = db()
  const to = normalizeEmails(mail.to)
  const cc = normalizeEmails(mail.cc)
  const { sender_upn, reply_to } = emailSettingsOf(tenant)

  const log = async (status: 'sent' | 'failed' | 'skipped', error?: string) => {
    mustWrite(
      'email_log insert',
      await supabase.from('email_log').insert({
        tenant_id: tenant.id,
        kind: mail.kind,
        recipients: [...to, ...cc],
        subject: mail.subject,
        status,
        error: error ?? null,
        sender: sender_upn,
        related_type: mail.relatedType ?? null,
        related_id: mail.relatedId ?? null,
      }),
    )
  }

  if (to.length === 0) {
    await log('skipped', 'No valid recipients')
    return { ok: false, error: 'No valid recipients' }
  }
  if (tenant.is_demo) {
    await log('skipped', 'Demo tenant: email recorded but not delivered')
    return { ok: true, skipped: true }
  }
  if (!sender_upn) {
    await log('failed', 'No sender mailbox configured')
    return { ok: false, error: 'No sender mailbox configured. Set one under Settings > Alert rules > Email delivery.' }
  }

  try {
    const graph = new GraphClient(tenant.ms_tenant_id)
    await graph.post(`/users/${encodeURIComponent(sender_upn)}/sendMail`, {
      message: {
        subject: mail.subject,
        body: { contentType: 'HTML', content: mail.html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        ccRecipients: cc.map((address) => ({ emailAddress: { address } })),
        replyTo: reply_to ? [{ emailAddress: { address: reply_to } }] : undefined,
      },
      saveToSentItems: false,
    })
    await log('sent')
    return { ok: true }
  } catch (err) {
    if (err instanceof WriteFailedError) throw err
    const friendly = friendlyGraphError(err)
    await log('failed', friendly.error)
    return { ok: false, ...friendly }
  }
}

export async function loadMailTenant(tenantId: string): Promise<MailTenant | null> {
  const { data } = await db().from('tenants').select('id,ms_tenant_id,display_name,is_demo,settings').eq('id', tenantId).maybeSingle()
  return (data as MailTenant | null) ?? null
}
