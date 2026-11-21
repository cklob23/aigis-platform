import { describe, expect, it } from 'vitest'
import { ALERT_TRIGGER_LABELS, type AlertTriggerType } from '@/lib/types'
import { DORMANT_ADMIN_DAYS, PRIVILEGED_REVIEW_DAYS } from '@/lib/risk/privileged'
import {
  ALERT_TRIGGER_DEFAULT_DESCRIPTION,
  PRIVILEGED_ALERT_TRIGGERS,
  alertTriggerDefaults,
  alertTriggerDescription,
  showPrivilegedAlertTriggerGroup,
  visibleAlertTriggers,
} from '@/lib/alerts/triggers'

describe('privileged alert trigger UI', () => {
  it('hides the Privileged access group when the module flag is off', () => {
    expect(showPrivilegedAlertTriggerGroup(false, 'risk_level')).toBe(false)
    const visible = visibleAlertTriggers(false, 'risk_level')
    for (const type of PRIVILEGED_ALERT_TRIGGERS) {
      expect(visible).not.toContain(type)
    }
  })

  it('shows the group when the module flag is on', () => {
    expect(showPrivilegedAlertTriggerGroup(true, 'risk_level')).toBe(true)
    expect(visibleAlertTriggers(true, 'risk_level')).toEqual(
      expect.arrayContaining([...PRIVILEGED_ALERT_TRIGGERS]),
    )
  })

  it('keeps a selected privileged trigger visible when the flag is off', () => {
    expect(showPrivilegedAlertTriggerGroup(false, 'dormant_admin')).toBe(true)
    expect(visibleAlertTriggers(false, 'dormant_admin')).toContain('dormant_admin')
  })

  it('uses designer labels and helper text without em dashes', () => {
    expect(ALERT_TRIGGER_LABELS.new_tier0_assignment).toEqual({
      label: 'New Tier 0 role assignment',
      description: 'Someone was given a Tier 0 role since the last scan.',
    })
    expect(ALERT_TRIGGER_LABELS.guest_with_role).toEqual({
      label: 'External identity with an admin role',
      description: 'An external identity holds a privileged directory role (any tier).',
    })
    expect(ALERT_TRIGGER_LABELS.dormant_admin.label).toBe('Dormant privileged account')
    expect(ALERT_TRIGGER_LABELS.privileged_not_reviewed).toEqual({
      label: 'Privileged access overdue for review',
      description: `Not reviewed in the last ${PRIVILEGED_REVIEW_DAYS} days.`,
    })
    expect(ALERT_TRIGGER_LABELS.privileged_change_not_seen).toEqual({
      label: 'Approved change not seen on scan',
      description: "A change marked as made in Microsoft wasn't detected on the next scan.",
    })
    for (const type of PRIVILEGED_ALERT_TRIGGERS) {
      const { label, description } = ALERT_TRIGGER_LABELS[type]
      expect(label).not.toMatch(/\u2014/)
      expect(description).not.toMatch(/\u2014/)
    }
  })

  it('defaults name and description to what the rule means, with no Settings instructions', () => {
    expect(alertTriggerDefaults('new_tier0_assignment')).toEqual({
      name: 'New Tier 0 role assignment',
      description: 'Someone was given a Tier 0 role since the last scan.',
    })
    expect(alertTriggerDescription('dormant_admin')).toBe(
      `Holds a privileged role and hasn't signed in for ${DORMANT_ADMIN_DAYS} days.`,
    )
    expect(alertTriggerDescription('privileged_not_reviewed')).toBe(
      `Not reviewed in the last ${PRIVILEGED_REVIEW_DAYS} days.`,
    )
    expect(alertTriggerDefaults('privileged_not_reviewed')).toEqual({
      name: 'Privileged access overdue for review',
      description: `Privileged access not reviewed in the last ${PRIVILEGED_REVIEW_DAYS} days.`,
    })
    for (const type of Object.keys(ALERT_TRIGGER_DEFAULT_DESCRIPTION) as AlertTriggerType[]) {
      const { description } = alertTriggerDefaults(type)
      expect(description).not.toMatch(/Settings|Change this|Turn on/)
      expect(description).not.toMatch(/\u2014/)
    }
  })
})
