import { describe, expect, it } from 'vitest'
import { WriteFailedError } from '@/lib/supabase/write'
import { appendScanFailedAlertError, applyScanAlertResults } from '@/lib/scan/alerts'

describe('appendScanFailedAlertError', () => {
  it('keeps the original scan error and names the alert write failure', () => {
    expect(appendScanFailedAlertError('Graph 403', new WriteFailedError('alerts insert', 'duplicate dedupe_key'))).toBe(
      'Graph 403; scan-failed alerts: alerts insert: duplicate dedupe_key',
    )
  })
})

describe('applyScanAlertResults', () => {
  it('records created and emailed counts on success', async () => {
    const summary = { guests: 3 }
    await expect(applyScanAlertResults(summary, async () => ({ created: 2, emailed: 1 }))).resolves.toEqual({
      guests: 3,
      alerts: 2,
      alert_emails: 1,
    })
  })

  it('propagates persist failures so they reach scan_jobs.error', async () => {
    const summary = { guests: 3 }
    await expect(
      applyScanAlertResults(summary, async () => {
        throw new WriteFailedError('alerts insert', 'duplicate dedupe_key')
      }),
    ).rejects.toThrow('alerts insert: duplicate dedupe_key')
    expect(summary).toEqual({ guests: 3 })
  })

  it('propagates last_fired_at failures the same way', async () => {
    await expect(
      applyScanAlertResults({}, async () => {
        throw new WriteFailedError('alert_rules last_fired_at', 'row locked')
      }),
    ).rejects.toThrow('alert_rules last_fired_at: row locked')
  })
})
