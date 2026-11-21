import { isPrivilegedAlertTrigger } from '@/lib/alerts/triggers'
import { privilegedAlertsEnabled } from '@/lib/privileged/capability'
import type { AlertTriggerType } from '@/lib/types'

export function privilegedAlertRuleBlocked(
  triggerType: AlertTriggerType,
  settings: Record<string, unknown> | null | undefined,
): string | null {
  if (!isPrivilegedAlertTrigger(triggerType)) return null
  if (privilegedAlertsEnabled(settings)) return null
  return 'Privileged alert rules require the Privileged access module.'
}
