import { mustWrite, type WriteTask } from '@/lib/supabase/write'

export type AlertPersistWriter = {
  insertAlerts: (rows: unknown[]) => WriteTask<{ id: string }[]>
  touchRule: (ruleId: string) => WriteTask
  stampAlerts?: (ids: string[], stamp: Record<string, unknown>) => WriteTask
}

/**
 * Insert new alerts, then stamp the rule as fired. A failed insert must not
 * look like a successful evaluation (no last_fired_at, no created count).
 */
export async function persistNewAlerts(
  db: AlertPersistWriter,
  input: { ruleId: string; rows: unknown[] },
): Promise<string[]> {
  if (input.rows.length === 0) return []
  const inserted = mustWrite('alerts insert', await db.insertAlerts(input.rows))
  const ids = (inserted.data ?? []).map((row) => row.id).filter(Boolean)
  if (ids.length === 0) {
    throw new Error('alerts insert: no rows returned')
  }
  mustWrite('alert_rules last_fired_at', await db.touchRule(input.ruleId))
  return ids
}

export async function stampAlertEmail(
  db: Pick<AlertPersistWriter, 'stampAlerts'>,
  ids: string[],
  stamp: Record<string, unknown>,
) {
  if (!ids.length || !db.stampAlerts) return
  mustWrite('alerts email stamp', await db.stampAlerts(ids, stamp))
}
