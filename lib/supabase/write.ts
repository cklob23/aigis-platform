export type WriteError = { message: string; code?: string }

export type WriteResult<T = unknown> = {
  error: WriteError | null
  data?: T | null
}

/** supabase-js builders are thenable but are not Promise instances. */
export type WriteTask<T = unknown> = PromiseLike<WriteResult<T>>

export class WriteFailedError extends Error {
  readonly label: string
  constructor(label: string, message: string) {
    super(`${label}: ${message}`)
    this.name = 'WriteFailedError'
    this.label = label
  }
}

export function mustWrite<T extends WriteResult>(label: string, result: T): T {
  if (result.error) throw new WriteFailedError(label, result.error.message)
  return result
}

/**
 * If the write failed, run `rollback` then throw. Rollback errors are swallowed
 * so the original write failure is what callers see.
 */
export async function mustWriteOrRollback<T extends WriteResult>(
  label: string,
  result: T,
  rollback: () => PromiseLike<unknown>,
): Promise<T> {
  if (!result.error) return result
  try {
    await rollback()
  } catch {
    // Keep the original write error.
  }
  throw new WriteFailedError(label, result.error.message)
}
