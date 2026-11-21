import { ALERT_TRIGGER_LABELS, type AlertTriggerType } from '@/lib/types'
import { DORMANT_ADMIN_DAYS, PRIVILEGED_REVIEW_DAYS } from '@/lib/risk/privileged'

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

/** Default Description field: what the rule means. No Settings instructions. */
export const ALERT_TRIGGER_DEFAULT_DESCRIPTION: Record<AlertTriggerType, string> = {
  new_external_identity: 'An external identity appeared in the tenant for the first time.',
  risk_level: 'An identity is scored at or above a chosen risk level.',
  unapproved_organization: 'An identity from an unreviewed, restricted or blocked organization holds access.',
  sensitive_access: 'An external identity is a member of a resource tagged sensitive.',
  inactive_identity: 'No sign-in for more than a chosen number of days while access remains.',
  review_overdue: 'An active review passed its due date with pending decisions.',
  scan_failed: 'A scheduled or manual scan ended with an error.',
  new_tier0_assignment: 'Someone was given a Tier 0 role since the last scan.',
  guest_with_role: 'An external identity holds a privileged directory role (any tier).',
  dormant_admin: `A privileged account hasn't signed in for ${DORMANT_ADMIN_DAYS} days.`,
  privileged_not_reviewed: `Privileged access not reviewed in the last ${PRIVILEGED_REVIEW_DAYS} days.`,
  privileged_change_not_seen: "A change marked as made in Microsoft wasn't detected on the next scan.",
}

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

export function alertTriggerDescription(type: AlertTriggerType): string {
  if (type === 'dormant_admin') {
    return `Holds a privileged role and hasn't signed in for ${DORMANT_ADMIN_DAYS} days.`
  }
  if (type === 'privileged_not_reviewed') {
    return `Not reviewed in the last ${PRIVILEGED_REVIEW_DAYS} days.`
  }
  return ALERT_TRIGGER_LABELS[type].description
}

export function alertTriggerDefaults(type: AlertTriggerType): { name: string; description: string } {
  return {
    name: ALERT_TRIGGER_LABELS[type].label,
    description: ALERT_TRIGGER_DEFAULT_DESCRIPTION[type],
  }
}

export function alertTriggerItems(
  privilegedEnabled: boolean,
  selected: AlertTriggerType,
): Record<string, string> {
  return Object.fromEntries(
    visibleAlertTriggers(privilegedEnabled, selected).map((t) => [t, ALERT_TRIGGER_LABELS[t].label]),
  )
}
