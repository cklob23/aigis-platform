export type WriteError = { message: string; code?: string }

export type WriteResult<T = unknown> = {
  error: WriteError | null
  data?: T | null
}

/** supabase-js builders are thenable but are not Promise instances. */
export type WriteTask<T = unknown> = PromiseLike<WriteResult<T>>

export class WriteFailedError extends Error {
  readonly label: string
  readonly writeMessage: string
  constructor(label: string, message: string) {
    super(`${label}: ${message}`)
    this.name = 'WriteFailedError'
    this.label = label
    this.writeMessage = message
  }
}

export function mustWrite<T extends WriteResult>(label: string, result: T): T {
  if (result.error) throw new WriteFailedError(label, result.error.message)
  return result
}

function failedWriteMessage(result: unknown): string | null {
  if (!result || typeof result !== 'object' || !('error' in result)) return null
  const error = (result as WriteResult).error
  return error?.message ?? null
}

/**
 * If the write failed, run `rollback` then throw. A rollback that throws or
 * returns `{ error }` is included in the thrown message so a leftover header
 * is not silent. The original write failure stays the primary error.
 */
export async function mustWriteOrRollback<T extends WriteResult>(
  label: string,
  result: T,
  rollback: () => PromiseLike<unknown>,
): Promise<T> {
  if (!result.error) return result
  let rollbackFailed: string | null = null
  try {
    rollbackFailed = failedWriteMessage(await rollback())
  } catch (err) {
    rollbackFailed = err instanceof Error ? err.message : 'rollback failed'
  }
  const detail = rollbackFailed
    ? `${result.error.message} (rollback also failed: ${rollbackFailed})`
    : result.error.message
  throw new WriteFailedError(label, detail)
}
