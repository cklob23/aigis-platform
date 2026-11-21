import { describe, expect, it } from 'vitest'
import { REDACTED_PRIVILEGED_ALERT_TITLE, redactPrivilegedAlert } from '@/lib/alerts/redact'

describe('redactPrivilegedAlert', () => {
  it('redacts privileged alert subjects without audit.view', () => {
    const alert = {
      alert_type: 'dormant_admin',
      title: 'Dormant privileged identity: Adele Admin',
      description: 'No sign-in for 90 days or more.',
    }
    expect(redactPrivilegedAlert(alert, true)).toEqual(alert)
    expect(redactPrivilegedAlert(alert, false)).toEqual({
      alert_type: 'dormant_admin',
      title: REDACTED_PRIVILEGED_ALERT_TITLE,
      description: null,
    })
  })

  it('leaves guest alerts intact', () => {
    const alert = { alert_type: 'risk_level', title: 'High risk: vendor@fabrikam.example', description: 'Score 80' }
    expect(redactPrivilegedAlert(alert, false)).toEqual(alert)
  })
})
