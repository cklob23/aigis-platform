import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { AlertRule, EmailLogEntry } from '@/lib/types'

export async function listAlertRules(tenantId: string) {
  const { data } = await db().from('alert_rules').select('*').eq('tenant_id', tenantId).order('severity').order('name')
  const rules = (data ?? []) as AlertRule[]
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  return rules.sort((a, b) => order[a.severity] - order[b.severity] || a.name.localeCompare(b.name))
}

export async function listEmailLog(tenantId: string, limit = 25) {
  const { data } = await db().from('email_log').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(limit)
  return (data ?? []) as EmailLogEntry[]
}

export async function alertCountsByRule(tenantId: string) {
  const { data } = await db().from('alerts').select('rule_id,status').eq('tenant_id', tenantId).not('rule_id', 'is', null)
  const out = new Map<string, { total: number; open: number }>()
  for (const a of data ?? []) {
    const cur = out.get(a.rule_id as string) ?? { total: 0, open: 0 }
    cur.total += 1
    if (a.status === 'open') cur.open += 1
    out.set(a.rule_id as string, cur)
  }
  return out
}
