import { isPrivilegedAlertTrigger } from '@/lib/alerts/triggers'
import type { AlertTriggerType } from '@/lib/types'

export const REDACTED_PRIVILEGED_ALERT_TITLE = '1 privileged alert'

export function redactPrivilegedAlert<T extends { alert_type: string; title: string; description?: string | null }>(
  alert: T,
  canViewAudit: boolean,
): T {
  if (canViewAudit) return alert
  if (!isPrivilegedAlertTrigger(alert.alert_type as AlertTriggerType)) return alert
  return { ...alert, title: REDACTED_PRIVILEGED_ALERT_TITLE, description: null }
}
