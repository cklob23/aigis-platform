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

/** Relative last-checked label. Hover title is local time plus the viewer's zone abbreviation. */
export function formatCheckedAt(iso: string, now = new Date()): { label: string; title: string } {
  const then = new Date(iso)
  const diffMin = Math.round((now.getTime() - then.getTime()) / 60_000)
  let label = 'Just now'
  if (diffMin <= -1) label = 'Just now'
  else if (diffMin >= 1 && diffMin < 60) label = `${diffMin} min ago`
  else if (diffMin >= 60 && diffMin < 1440) {
    const hours = Math.floor(diffMin / 60)
    label = hours === 1 ? '1 hr ago' : `${hours} hr ago`
  } else if (diffMin >= 1440) {
    const days = Math.floor(diffMin / 1440)
    label = days === 1 ? '1 day ago' : `${days} days ago`
  }
  const zone =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(then).find((p) => p.type === 'timeZoneName')
      ?.value ?? ''
  const exact = then.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return { label, title: zone ? `${exact} ${zone}` : exact }
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
