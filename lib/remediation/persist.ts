import { mustWrite, WriteFailedError, type WriteResult, type WriteTask } from '@/lib/supabase/write'

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
      mustWrite('remediation_actions markFailed', await markFailed(message))
    } catch (stampErr) {
      const stampMessage = stampErr instanceof WriteFailedError ? stampErr.writeMessage : stampErr instanceof Error ? stampErr.message : 'markFailed failed'
      const label = err instanceof WriteFailedError ? err.label : 'remediation write'
      const writeMessage = err instanceof WriteFailedError ? err.writeMessage : message
      throw new WriteFailedError(label, `${writeMessage} (status stamp also failed: ${stampMessage})`)
    }
    throw err
  }
}
