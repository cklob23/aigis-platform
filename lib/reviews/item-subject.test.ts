import { describe, expect, it } from 'vitest'
import {
  compareReviewItems,
  reviewItemGuestHref,
  reviewItemGuestLabel,
  type ReviewItemWithGuest,
} from '@/lib/reviews/item-subject'
const item = (over: Partial<ReviewItemWithGuest> & Pick<ReviewItemWithGuest, 'guest'>): ReviewItemWithGuest => ({
  id: 'ri1',
  review_id: 'rev1',
  guest_id: over.guest?.id ?? null,
  identity_id: over.identity_id ?? 'i1',
  subject_kind: 'identity',
  role_assignment_id: null,
  status: 'pending',
  decision: null,
  final_action: null,
  resources_snapshot: [],
  decided_at: null,
  ...over,
})

const guest = {
  id: 'g1',
  display_name: 'Pat Guest',
  email: 'pat@partner.example',
  domain: 'partner.example',
  risk_level: 'high' as const,
  risk_score: 40,
  last_sign_in_at: null,
  sponsor_display_name: null,
  recommended_action: 'review' as const,
}

describe('review item row subject', () => {
  it('keeps guest-keyed labels and hrefs', () => {
    expect(reviewItemGuestLabel(guest)).toBe('Pat Guest')
    expect(reviewItemGuestHref(guest)).toBe('/guests/g1')
  })

  it('tolerates a null guest without throwing', () => {
    expect(reviewItemGuestLabel(null)).toBe('Identity')
    expect(reviewItemGuestHref(null)).toBeNull()
    const identityOnly = item({ guest: null, guest_id: null, identity_id: 'i9' })
    const withGuest = item({ guest, status: 'decided' })
    expect(compareReviewItems(identityOnly, withGuest)).toBeLessThan(0)
    expect(compareReviewItems(identityOnly, item({ guest: null, status: 'pending', identity_id: 'i8' }))).toBe(0)
  })
})
