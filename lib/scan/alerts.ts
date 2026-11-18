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
