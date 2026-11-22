/** Intersect a small privileged-id list with the identities on the current page. */
export function privilegedIdsInSet(privilegedIds: string[], identityIds: string[]): string[] {
  if (identityIds.length === 0 || privilegedIds.length === 0) return []
  const wanted = new Set(identityIds)
  return privilegedIds.filter((id) => wanted.has(id))
}
