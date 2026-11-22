/** Relative in-app path plus query, or null if it is not a safe post-login destination. */
export function safeAppPath(value: string | null | undefined): string | null {
  if (!value) return null
  let path = value.trim()
  try {
    path = decodeURIComponent(path)
  } catch {
    // already decoded
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null
  if (path.startsWith('/auth') || path.startsWith('/api')) return null
  return path
}

export function loginNextParam(pathname: string, search = '') {
  return `${pathname}${search}`
}
