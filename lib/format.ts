const DAY = 86_400_000

export function relativeDays(iso: string | null | undefined, opts: { neverLabel?: string } = {}) {
  if (!iso) return opts.neverLabel ?? 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / DAY)
  if (days < 0) return `in ${Math.abs(days)}d`
  if (days === 0) {
    const hours = Math.floor(diff / 3_600_000)
    if (hours < 1) return 'Just now'
    return `${hours}h ago`
  }
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${(days / 365).toFixed(1)}y ago`
}

export function daysBetween(iso: string | null | undefined) {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY)
}

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—'
  const d = new Date(iso)
  return withTime
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatNumber(n: number | null | undefined) {
  return new Intl.NumberFormat('en-US').format(n ?? 0)
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
