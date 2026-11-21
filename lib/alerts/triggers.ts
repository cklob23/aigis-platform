import { ALERT_TRIGGER_LABELS, type AlertTriggerType } from '@/lib/types'
import { DORMANT_ADMIN_DAYS } from '@/lib/risk/privileged'
import { DEFAULT_RISK_POLICY } from '@/lib/risk/engine'

export const CORE_ALERT_TRIGGERS: AlertTriggerType[] = [
  'new_external_identity',
  'risk_level',
  'unapproved_organization',
  'sensitive_access',
  'inactive_identity',
  'review_overdue',
  'scan_failed',
]

export const PRIVILEGED_ALERT_TRIGGERS: AlertTriggerType[] = [
  'new_tier0_assignment',
  'guest_with_role',
  'dormant_admin',
  'privileged_not_reviewed',
  'privileged_change_not_seen',
]

export function isPrivilegedAlertTrigger(type: AlertTriggerType): boolean {
  return (PRIVILEGED_ALERT_TRIGGERS as readonly string[]).includes(type)
}

/** Hide the Privileged access group unless the Settings module flag is on, or the rule already uses one. */
export function showPrivilegedAlertTriggerGroup(
  privilegedEnabled: boolean,
  selected: AlertTriggerType,
): boolean {
  return privilegedEnabled || isPrivilegedAlertTrigger(selected)
}

export function visibleAlertTriggers(
  privilegedEnabled: boolean,
  selected: AlertTriggerType,
): AlertTriggerType[] {
  if (showPrivilegedAlertTriggerGroup(privilegedEnabled, selected)) {
    return [...CORE_ALERT_TRIGGERS, ...PRIVILEGED_ALERT_TRIGGERS]
  }
  return [...CORE_ALERT_TRIGGERS]
}

export function alertTriggerDescription(
  type: AlertTriggerType,
  reviewDays = DEFAULT_RISK_POLICY.reviewDays,
): string {
  if (type === 'dormant_admin') {
    return `Holds a privileged role and hasn't signed in for ${DORMANT_ADMIN_DAYS} days.`
  }
  if (type === 'privileged_not_reviewed') {
    return `Not reviewed in the last ${reviewDays} days. Change this under Settings, Review every (days).`
  }
  return ALERT_TRIGGER_LABELS[type].description
}

export function alertTriggerDefaults(
  type: AlertTriggerType,
  reviewDays = DEFAULT_RISK_POLICY.reviewDays,
): { name: string; description: string } {
  return {
    name: ALERT_TRIGGER_LABELS[type].label,
    description: alertTriggerDescription(type, reviewDays),
  }
}

export function alertTriggerItems(
  privilegedEnabled: boolean,
  selected: AlertTriggerType,
): Record<string, string> {
  return Object.fromEntries(
    visibleAlertTriggers(privilegedEnabled, selected).map((type) => [type, ALERT_TRIGGER_LABELS[type].label]),
  )
}
