import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { evaluateAlertRules } from '@/lib/alerts/evaluate'
import { sendDueReminders } from '@/lib/reviews/workflow'
import { authorizeCron } from '@/lib/cron/auth'

export const maxDuration = 300

/**
 * Daily notification sweep for every connected tenant: time-based alert
 * rules (inactive identities, overdue reviews) and review reminders.
 * Render (and Vercel Cron) send `Authorization: Bearer ${CRON_SECRET}`.
 * Fail closed when the secret is unset.
 */
export async function GET(req: Request) {
  const auth = authorizeCron(process.env.CRON_SECRET, req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { data: tenants } = await db().from('tenants').select('id,display_name').not('onboarding_completed_at', 'is', null)
  const results: Record<string, { alerts: number; emails: number; reminders: number; error?: string }> = {}

  for (const t of tenants ?? []) {
    try {
      const fired = await evaluateAlertRules(t.id as string, { only: ['inactive_identity', 'review_overdue', 'unapproved_organization', 'risk_level', 'sensitive_access'] })
      const reminders = await sendDueReminders(t.id as string)
      results[t.id as string] = { alerts: fired.created, emails: fired.emailed, reminders }
    } catch (err) {
      results[t.id as string] = { alerts: 0, emails: 0, reminders: 0, error: err instanceof Error ? err.message : 'failed' }
    }
  }

  return NextResponse.json({ ok: true, tenants: Object.keys(results).length, results })
}
