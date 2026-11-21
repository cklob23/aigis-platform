'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { evaluateAlertRules } from '@/lib/alerts/evaluate'
import { loadMailTenant, normalizeEmails, publicOrigin, sendMail } from '@/lib/email/mailer'
import { testMessage } from '@/lib/email/templates'
import { ALERT_TRIGGER_LABELS, type AlertRuleConditions, type AlertTriggerType, type RiskLevel } from '@/lib/types'
import { privilegedAlertRuleBlocked } from '@/lib/alerts/privileged-gate'

type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }
}

export type AlertRuleInput = {
  id?: string
  name: string
  description?: string
  triggerType: AlertTriggerType
  severity: RiskLevel
  conditions: AlertRuleConditions
  recipients: string
  notifyEmail: boolean
  enabled: boolean
}

export async function saveAlertRule(input: AlertRuleInput): Promise<ActionResult & { id?: string }> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Name is required.' }
    if (!ALERT_TRIGGER_LABELS[input.triggerType]) return { ok: false, error: 'Unknown trigger.' }
    const blocked = privilegedAlertRuleBlocked(input.triggerType, tenant.settings)
    if (blocked) return { ok: false, error: blocked }
    const recipients = normalizeEmails(input.recipients)
    if (input.notifyEmail && recipients.length === 0) return { ok: false, error: 'Add at least one recipient or turn off email.' }

    const conditions: AlertRuleConditions = {}
    if (input.triggerType === 'risk_level' || input.triggerType === 'sensitive_access') conditions.min_risk_level = input.conditions.min_risk_level
    if (input.triggerType === 'inactive_identity') conditions.inactive_days = Math.min(3650, Math.max(1, Number(input.conditions.inactive_days ?? 90)))
    if (input.triggerType === 'unapproved_organization') {
      conditions.approval_states = input.conditions.approval_states?.length ? input.conditions.approval_states : ['unreviewed', 'restricted', 'blocked']
      conditions.sensitive_only = Boolean(input.conditions.sensitive_only)
    }

    const row = {
      tenant_id: tenant.id,
      name,
      description: input.description?.trim() || null,
      trigger_type: input.triggerType,
      severity: input.severity,
      conditions,
      recipients,
      notify_email: input.notifyEmail,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    }
    const supabase = db()
    let id = input.id
    if (id) {
      const { data: prev } = await supabase.from('alert_rules').select('*').eq('tenant_id', tenant.id).eq('id', id).maybeSingle()
      if (!prev) return { ok: false, error: 'Rule not found.' }
      const { error } = await supabase.from('alert_rules').update(row).eq('tenant_id', tenant.id).eq('id', id)
      if (error) throw error
      await audit(session, { action: 'alert_rule.updated', targetType: 'alert_rule', targetId: id, targetLabel: name, previousState: prev, newState: row })
    } else {
      const { data, error } = await supabase.from('alert_rules').insert({ ...row, created_by: session.demo ? null : session.userId }).select('id').single()
      if (error) throw error
      id = data.id as string
      await audit(session, { action: 'alert_rule.created', targetType: 'alert_rule', targetId: id, targetLabel: name, newState: row })
    }
    revalidatePath('/settings/alerts')
    return { ok: true, id, message: input.id ? 'Rule updated' : 'Rule created' }
  } catch (err) {
    return fail(err)
  }
}

export async function toggleAlertRule(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    const { error } = await db().from('alert_rules').update({ enabled, updated_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('id', id)
    if (error) throw error
    await audit(session, { action: enabled ? 'alert_rule.enabled' : 'alert_rule.disabled', targetType: 'alert_rule', targetId: id })
    revalidatePath('/settings/alerts')
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function deleteAlertRule(id: string): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    const { data: prev } = await db().from('alert_rules').select('name').eq('tenant_id', tenant.id).eq('id', id).maybeSingle()
    const { error } = await db().from('alert_rules').delete().eq('tenant_id', tenant.id).eq('id', id)
    if (error) throw error
    await audit(session, { action: 'alert_rule.deleted', targetType: 'alert_rule', targetId: id, targetLabel: prev?.name as string | undefined })
    revalidatePath('/settings/alerts')
    return { ok: true, message: 'Rule deleted' }
  } catch (err) {
    return fail(err)
  }
}

/** Evaluate all enabled rules now against the current inventory. */
export async function runAlertRulesNow(): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    const res = await evaluateAlertRules(tenant.id, { scanStartedAt: new Date(Date.now() - 86_400_000).toISOString() })
    await audit(session, { action: 'alert_rule.evaluated', targetType: 'tenant', targetId: tenant.id, newState: res })
    revalidatePath('/settings/alerts')
    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return { ok: true, message: `${res.created} new alert${res.created === 1 ? '' : 's'}, ${res.emailed} email${res.emailed === 1 ? '' : 's'} sent` }
  } catch (err) {
    return fail(err)
  }
}

export async function updateEmailSettings(input: { senderUpn: string; replyTo: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'settings.manage')
    const sender = normalizeEmails(input.senderUpn)[0] ?? null
    const replyTo = normalizeEmails(input.replyTo)[0] ?? null
    if (input.senderUpn.trim() && !sender) return { ok: false, error: 'Sender must be a valid mailbox address (UPN).' }
    const prev = tenant.settings.email ?? null
    const settings = { ...tenant.settings, email: { sender_upn: sender, reply_to: replyTo } }
    const { error } = await db().from('tenants').update({ settings }).eq('id', tenant.id)
    if (error) throw error
    await audit(session, { action: 'settings.email_updated', targetType: 'tenant', targetId: tenant.id, previousState: prev, newState: settings.email })
    revalidatePath('/settings/alerts')
    return { ok: true, message: 'Email delivery settings saved' }
  } catch (err) {
    return fail(err)
  }
}

export async function sendTestEmail(to: string): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'settings.manage')
    const recipient = normalizeEmails(to)[0] ?? session.email
    const mailTenant = await loadMailTenant(tenant.id)
    if (!mailTenant) return { ok: false, error: 'Tenant not found.' }
    const sender = (mailTenant.settings.email as { sender_upn?: string } | undefined)?.sender_upn ?? ''
    const msg = testMessage({ tenantName: tenant.display_name, sender, origin: await publicOrigin() })
    const res = await sendMail(mailTenant, { kind: 'test', to: [recipient], subject: msg.subject, html: msg.html })
    revalidatePath('/settings/alerts')
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, message: res.skipped ? 'Demo tenant: test logged but not delivered' : `Test email sent to ${recipient}` }
  } catch (err) {
    return fail(err)
  }
}
