import { describe, expect, it, vi } from 'vitest'
import { attachReviewGuests, requireReviewHeader } from '@/lib/reviews/write'

function ok<T>(data: T) {
  return Promise.resolve({ error: null, data })
}
function fail(message: string) {
  return Promise.resolve({ error: { message }, data: null })
}

describe('requireReviewHeader', () => {
  it('throws when the header insert reports an error', () => {
    expect(() => requireReviewHeader({ error: { message: 'not null violation' }, data: null })).toThrow(
      'access_reviews insert: not null violation',
    )
  })

  it('throws when the insert succeeds without an id', () => {
    expect(() => requireReviewHeader({ error: null, data: null })).toThrow('access_reviews insert: missing id')
  })
})

describe('attachReviewGuests', () => {
  it('inserts items then marks guests pending', async () => {
    const db = {
      insertItems: vi.fn(() => ok(null)),
      updateGuestsPending: vi.fn(() => ok(null)),
      deleteReview: vi.fn(() => ok(null)),
    }
    await attachReviewGuests(db, { reviewId: 'rev-1', items: [{ guest_id: 'g1' }], guestIds: ['g1'] })
    expect(db.insertItems).toHaveBeenCalledWith([{ guest_id: 'g1' }])
    expect(db.updateGuestsPending).toHaveBeenCalledWith(['g1'])
    expect(db.deleteReview).not.toHaveBeenCalled()
  })

  it('inserts identity-only items without updating guest_identities', async () => {
    const db = {
      insertItems: vi.fn(() => ok(null)),
      updateGuestsPending: vi.fn(() => ok(null)),
      deleteReview: vi.fn(() => ok(null)),
    }
    await attachReviewGuests(db, {
      reviewId: 'rev-1',
      items: [{ guest_id: null, identity_id: 'i9', subject_kind: 'identity' }],
      guestIds: [],
    })
    expect(db.insertItems).toHaveBeenCalled()
    expect(db.updateGuestsPending).not.toHaveBeenCalled()
    expect(db.deleteReview).not.toHaveBeenCalled()
  })

  it('deletes the review header when review_items insert fails', async () => {
    const db = {
      insertItems: vi.fn(() => fail('null identity_id')),
      updateGuestsPending: vi.fn(() => ok(null)),
      deleteReview: vi.fn(() => ok(null)),
    }
    await expect(
      attachReviewGuests(db, { reviewId: 'rev-1', items: [{ guest_id: 'g1' }], guestIds: ['g1'] }),
    ).rejects.toThrow('review_items insert: null identity_id')
    expect(db.updateGuestsPending).not.toHaveBeenCalled()
    expect(db.deleteReview).toHaveBeenCalledWith('rev-1')
  })

  it('deletes the review header when guest status update fails after items insert', async () => {
    const db = {
      insertItems: vi.fn(() => ok(null)),
      updateGuestsPending: vi.fn(() => fail('row locked')),
      deleteReview: vi.fn(() => ok(null)),
    }
    await expect(
      attachReviewGuests(db, { reviewId: 'rev-1', items: [{ guest_id: 'g1' }], guestIds: ['g1'] }),
    ).rejects.toThrow('guest_identities review_status: row locked')
    expect(db.deleteReview).toHaveBeenCalledWith('rev-1')
  })

  it('includes a failed header delete in the thrown write error', async () => {
    const db = {
      insertItems: vi.fn(() => fail('null identity_id')),
      updateGuestsPending: vi.fn(() => ok(null)),
      deleteReview: vi.fn(() => fail('still referenced')),
    }
    await expect(
      attachReviewGuests(db, { reviewId: 'rev-1', items: [{ guest_id: 'g1' }], guestIds: ['g1'] }),
    ).rejects.toThrow('review_items insert: null identity_id (rollback also failed: still referenced)')
    expect(db.deleteReview).toHaveBeenCalledWith('rev-1')
  })
})
