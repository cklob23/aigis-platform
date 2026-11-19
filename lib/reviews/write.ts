import { mustWrite, mustWriteOrRollback, type WriteResult, type WriteTask } from '@/lib/supabase/write'

export type ReviewScopeWriter = {
  insertItems: (rows: unknown[]) => WriteTask
  updateGuestsPending: (guestIds: string[]) => WriteTask
  deleteReview: (reviewId: string) => WriteTask
}

/**
 * Attach guests to a newly created review. If items or the pending-status
 * update fail, delete the review header so we do not leave an empty review
 * that the UI would treat as created.
 */
export async function attachReviewGuests(
  db: ReviewScopeWriter,
  input: { reviewId: string; items: unknown[]; guestIds: string[] },
) {
  const rollback = () => db.deleteReview(input.reviewId)
  await mustWriteOrRollback('review_items insert', await db.insertItems(input.items), rollback)
  if (input.guestIds.length === 0) return
  await mustWriteOrRollback('guest_identities review_status', await db.updateGuestsPending(input.guestIds), rollback)
}

export function requireReviewHeader(result: WriteResult<{ id: string }>, label = 'access_reviews insert') {
  const written = mustWrite(label, result)
  if (!written.data?.id) throw new Error(`${label}: missing id`)
  return written.data
}
