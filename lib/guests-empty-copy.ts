/** Empty-table copy for the /guests inventory. High-risk filter only; every other combination keeps the generic line. */
export function guestsEmptyCopy(filters: {
  risk?: string | null
  q?: string | null
  domain?: string | null
  status?: string | null
  activity?: string | null
  sponsor?: string | null
  review?: string | null
  action?: string | null
  cause?: string | null
}): string {
  const otherFiltersActive = Boolean(
    filters.q || filters.domain || filters.status || filters.activity || filters.sponsor || filters.review || filters.action || filters.cause,
  )
  if (filters.risk === 'high' && !otherFiltersActive) {
    return 'No high-risk external identities right now.'
  }
  return 'No identities match these filters.'
}
