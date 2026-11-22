import type { Guest, RiskLevel } from '@/lib/types'
import { RISK_CAUSES, type RiskCauseKey } from '@/lib/risk/recommendation'

export type GuestScoreListFilters = {
  risk?: RiskLevel | 'all'
  cause?: RiskCauseKey
  sort?: 'risk' | 'name' | 'last_sign_in' | 'created'
  page?: number
  pageSize?: number
}

function guestSortValue(guest: Guest, sort: GuestScoreListFilters['sort']) {
  if (sort === 'name') return guest.display_name ?? ''
  if (sort === 'last_sign_in') return guest.last_sign_in_at ?? ''
  if (sort === 'created') return guest.created_at_ms ?? ''
  return guest.risk_score
}

export function filterSortPageGuests(guests: Guest[], f: GuestScoreListFilters) {
  const page = Math.max(1, f.page ?? 1)
  const pageSize = Math.min(200, f.pageSize ?? 50)
  let next = guests
  if (f.risk && f.risk !== 'all') next = next.filter((guest) => guest.risk_level === f.risk)
  if (f.cause) next = next.filter((guest) => guest.risk_factors.some((factor) => factor.key === f.cause))
  const sort = f.sort ?? 'risk'
  next = [...next].sort((a, b) => {
    if (sort === 'risk') {
      if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score
      return (a.display_name ?? '').localeCompare(b.display_name ?? '')
    }
    if (sort === 'name') return (a.display_name ?? '').localeCompare(b.display_name ?? '')
    if (sort === 'last_sign_in') {
      if (!a.last_sign_in_at && b.last_sign_in_at) return -1
      if (a.last_sign_in_at && !b.last_sign_in_at) return 1
      return (a.last_sign_in_at ?? '').localeCompare(b.last_sign_in_at ?? '')
    }
    return (b.created_at_ms ?? '').localeCompare(a.created_at_ms ?? '')
  })
  const total = next.length
  const start = (page - 1) * pageSize
  return { guests: next.slice(start, start + pageSize), total, page, pageSize }
}

export function causeCountsFromGuests(guests: Guest[], risk: RiskLevel) {
  const atRisk = guests.filter((guest) => guest.risk_level === risk)
  return Object.fromEntries(
    RISK_CAUSES.map((cause) => [cause.key, atRisk.filter((guest) => guest.risk_factors.some((factor) => factor.key === cause.key)).length]),
  ) as Record<RiskCauseKey, number>
}

export { guestSortValue }
