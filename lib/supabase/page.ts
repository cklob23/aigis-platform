/** PostgREST returns at most this many rows per select unless range() pages. */
export const SUPABASE_ROW_CAP = 1000

export type PageResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

export type RangeQuery<T> = {
  order: (
    column: string,
    options: { ascending: boolean },
  ) => {
    range: (from: number, to: number) => PromiseLike<PageResult<T>>
  }
}

/**
 * Load every matching row. Each page is ordered by id and fetched with
 * range(from, from + 999) so the PostgREST 1000-row cap cannot truncate.
 */
export async function fetchAllById<T>(label: string, createQuery: () => RangeQuery<T>): Promise<T[]> {
  const out: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await createQuery().order('id', { ascending: true }).range(from, from + SUPABASE_ROW_CAP - 1)
    if (error) throw new Error(`${label}: ${error.message}`)
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < SUPABASE_ROW_CAP) return out
    from += SUPABASE_ROW_CAP
  }
}
