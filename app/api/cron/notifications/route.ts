import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { evaluateAlertRules } from '@/lib/alerts/evaluate'
import { sendDueReminders } from '@/lib/reviews/workflow'

export const maxDuration = 300

/**
 * Daily notification sweep for every connected tenant: time-based alert
 * rules (inactive identities, overdue reviews) and review reminders.
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
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
