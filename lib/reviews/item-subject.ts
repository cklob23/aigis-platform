import type { Guest, ReviewItem } from '@/lib/types'

export type ReviewItemGuest = Pick<
  Guest,
  | 'id'
  | 'display_name'
  | 'email'
  | 'domain'
  | 'risk_level'
  | 'risk_score'
  | 'last_sign_in_at'
  | 'sponsor_display_name'
  | 'recommended_action'
>

export type ReviewItemWithGuest = ReviewItem & { guest: ReviewItemGuest | null }

export function reviewItemGuestLabel(guest: ReviewItemGuest | null | undefined): string {
  if (!guest) return 'Identity'
  return guest.display_name ?? guest.email ?? 'Identity'
}

export function reviewItemGuestHref(guest: ReviewItemGuest | null | undefined): string | null {
  if (!guest) return null
  return `/guests/${guest.id}`
}

export function compareReviewItems(a: ReviewItemWithGuest, b: ReviewItemWithGuest): number {
  const pending = (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1)
  if (pending) return pending
  return (b.guest?.risk_score ?? 0) - (a.guest?.risk_score ?? 0)
}
