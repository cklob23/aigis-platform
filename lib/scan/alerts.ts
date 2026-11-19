/** Append a scan-failed alert write error so it is not only console.logged. */
export function appendScanFailedAlertError(scanMessage: string, alertErr: unknown): string {
  const extra = alertErr instanceof Error ? alertErr.message : 'alert evaluation failed'
  return `${scanMessage}; scan-failed alerts: ${extra}`
}

/**
 * Record post-scan alert evaluation onto the job summary. Failures must throw
 * so runScan writes them to scan_jobs.error instead of completing as success.
 */
export async function applyScanAlertResults<T extends Record<string, unknown>>(
  summary: T,
  evaluate: () => Promise<{ created: number; emailed: number }>,
): Promise<T> {
  const fired = await evaluate()
  return Object.assign(summary, { alerts: fired.created, alert_emails: fired.emailed })
}
