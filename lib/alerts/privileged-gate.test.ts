import { describe, expect, it } from 'vitest'
import { privilegedAlertsEnabled, privilegedPagesEnabled, privilegedStageEnabled } from '@/lib/privileged/capability'
import { isPrivilegedAlertTrigger, showPrivilegedAlertTriggerGroup } from '@/lib/alerts/triggers'
import { privilegedAlertRuleBlocked } from '@/lib/alerts/privileged-gate'

const available = {
  pim: 'available',
  pim_groups: 'available',
  sign_in_activity: true,
  auth_methods: true,
  license_hint: 'p2',
  checked_at: '2026-11-19T12:00:00.000Z',
  scan_job_id: null,
}

const needsConsent = { ...available, pim: 'needs_consent', pim_groups: 'needs_consent' }

describe('privileged alert flag vs pages flag', () => {
  it('uses the same check as the scan stage for alerts, not pages.enabled', () => {
    const on = { privileged: { enabled: true, capability: available } }
    const consent = { privileged: { enabled: true, capability: needsConsent } }
    expect(privilegedAlertsEnabled(on)).toBe(true)
    expect(privilegedAlertsEnabled(consent)).toBe(false)
    expect(privilegedAlertsEnabled(on)).toBe(privilegedStageEnabled(on))
    expect(privilegedPagesEnabled(on)).toBe(true)
    expect(privilegedPagesEnabled(consent)).toBe(true)
    expect(showPrivilegedAlertTriggerGroup(privilegedAlertsEnabled(consent), 'risk_level')).toBe(false)
    expect(isPrivilegedAlertTrigger('dormant_admin')).toBe(true)
    expect(privilegedAlertRuleBlocked('dormant_admin', consent)).toMatch(/Privileged access module/)
    expect(privilegedAlertRuleBlocked('dormant_admin', on)).toBeNull()
    expect(privilegedAlertRuleBlocked('risk_level', consent)).toBeNull()
  })
})
