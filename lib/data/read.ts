export type QueryResult<T> = { error: { message: string } | null; data?: T | null }

export function requireQueryRow<T>(label: string, result: QueryResult<T>): T | null {
  if (result.error) throw new Error(`${label}: ${result.error.message}`)
  return result.data ?? null
}
