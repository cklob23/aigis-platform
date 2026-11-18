import { mustWrite, type WriteResult, type WriteTask } from '@/lib/supabase/write'

export type RemediationActionInsert = WriteResult<{ id: string }>

export function requireRemediationAction(result: RemediationActionInsert) {
  const written = mustWrite('remediation_actions insert', result)
  if (!written.data?.id) throw new Error('remediation_actions insert: missing id')
  return written.data
}

export async function persistRemediationEffects(
  writes: Array<{ label: string; run: () => WriteTask }>,
  markFailed: (message: string) => WriteTask,
) {
  try {
    for (const write of writes) {
      mustWrite(write.label, await write.run())
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Remediation write failed'
    try {
      await markFailed(message)
    } catch {
      // Keep the original write error.
    }
    throw err
  }
}
