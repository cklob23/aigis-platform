import 'server-only'
import { db } from '@/lib/supabase/admin'
import { loadMailTenant, normalizeEmails, publicOrigin, sendMail } from '@/lib/email/mailer'
import { reviewApprovalRequest, reviewAssigned, reviewDecision, reviewReminder } from '@/lib/email/templates'
import { DEFAULT_REVIEW_WORKFLOW, type AccessReview, type ReviewWorkflowSettings } from '@/lib/types'
import { mustWrite } from '@/lib/supabase/write'

export function reviewWorkflowOf(settings: Record<string, unknown>): ReviewWorkflowSettings {
  const raw = (settings?.review_workflow as Partial<ReviewWorkflowSettings> | undefined) ?? {}
  return {
    ...DEFAULT_REVIEW_WORKFLOW,
    ...raw,
    approver_emails: normalizeEmails(raw.approver_emails ?? []),
    default_reviewer_emails: normalizeEmails(raw.default_reviewer_emails ?? []),
  }
}

export function isApprover(workflow: ReviewWorkflowSettings, email: string | null | undefined) {
  return Boolean(email && workflow.approver_emails.includes(email.toLowerCase()))
}

async function reviewWithCount(tenantId: string, reviewId: string) {
  const supabase = db()
  const { data: review } = await supabase.from('access_reviews').select('*').eq('tenant_id', tenantId).eq('id', reviewId).maybeSingle()
  if (!review) return null
  const { count } = await supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('review_id', reviewId)
  return { review: review as AccessReview, guestCount: count ?? 0 }
}

/** Email approvers that a review is waiting for sign-off. */
export async function notifyApprovers(tenantId: string, reviewId: string, requestedBy: string) {
  const tenant = await loadMailTenant(tenantId)
  const found = await reviewWithCount(tenantId, reviewId)
  if (!tenant || !found) return { ok: false as const, error: 'Review not found' }
  const workflow = reviewWorkflowOf(tenant.settings)
  if (workflow.approver_emails.length === 0) return { ok: false as const, error: 'No approvers configured' }
  const msg = reviewApprovalRequest({ tenantName: tenant.display_name, reviewName: found.review.name, requestedBy, guestCount: found.guestCount, dueAt: found.review.due_at, description: found.review.description, origin: await publicOrigin(), reviewId })
  return sendMail(tenant, { kind: 'review_approval_request', to: workflow.approver_emails, subject: msg.subject, html: msg.html, relatedType: 'access_review', relatedId: reviewId })
}

/** Resolve the reviewer list: explicit reviewers on the review, plus sponsors when enabled. */
async function reviewerRecipients(tenantId: string, review: AccessReview, workflow: ReviewWorkflowSettings) {
  const out = new Set<string>(normalizeEmails(review.reviewer_emails ?? []))
  if (workflow.notify_sponsors) {
    const supabase = db()
    const { data: items } = await supabase.from('review_items').select('guest:guest_identities(sponsor_email,sponsor_enabled)').eq('tenant_id', tenantId).eq('review_id', review.id)
    for (const i of items ?? []) {
      const g = i.guest as unknown as { sponsor_email: string | null; sponsor_enabled: boolean | null } | null
      if (g?.sponsor_email && g.sponsor_enabled !== false) out.add(g.sponsor_email.toLowerCase())
    }
  }
  return Array.from(out)
}

/** Email reviewers that a review is active and assigned to them. */
export async function notifyReviewers(tenantId: string, reviewId: string, approvedBy?: string | null) {
  const tenant = await loadMailTenant(tenantId)
  const found = await reviewWithCount(tenantId, reviewId)
  if (!tenant || !found) return { ok: false as const, error: 'Review not found' }
  const workflow = reviewWorkflowOf(tenant.settings)
  if (!workflow.notify_reviewers) return { ok: true as const, skipped: true }
  const to = await reviewerRecipients(tenantId, found.review, workflow)
  if (to.length === 0) return { ok: true as const, skipped: true }
  const msg = reviewAssigned({ tenantName: tenant.display_name, reviewName: found.review.name, guestCount: found.guestCount, dueAt: found.review.due_at, description: found.review.description, origin: await publicOrigin(), reviewId, approvedBy })
  const res = await sendMail(tenant, { kind: 'review_assigned', to, subject: msg.subject, html: msg.html, relatedType: 'access_review', relatedId: reviewId })
  if (res.ok) {
    mustWrite(
      'access_reviews reviewers_notified_at',
      await db().from('access_reviews').update({ reviewers_notified_at: new Date().toISOString() }).eq('id', reviewId),
    )
  }
  return res
}

/** Tell the requester whether their review was approved or rejected. */
export async function notifyRequester(tenantId: string, reviewId: string, approved: boolean, by: string, note?: string | null) {
  const tenant = await loadMailTenant(tenantId)
  const found = await reviewWithCount(tenantId, reviewId)
  if (!tenant || !found || !found.review.created_by_email) return { ok: true as const, skipped: true }
  const msg = reviewDecision({ tenantName: tenant.display_name, reviewName: found.review.name, approved, by, note, origin: await publicOrigin(), reviewId })
  return sendMail(tenant, { kind: 'review_decision', to: [found.review.created_by_email], subject: msg.subject, html: msg.html, relatedType: 'access_review', relatedId: reviewId })
}

/** Remind reviewers about pending decisions; used by the manual button and the daily cron. */
export async function remindReviewers(tenantId: string, reviewId: string) {
  const tenant = await loadMailTenant(tenantId)
  const found = await reviewWithCount(tenantId, reviewId)
  if (!tenant || !found) return { ok: false as const, error: 'Review not found' }
  const supabase = db()
  const { count: pending } = await supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('review_id', reviewId).eq('status', 'pending')
  if (!pending) return { ok: true as const, skipped: true }
  const workflow = reviewWorkflowOf(tenant.settings)
  const to = await reviewerRecipients(tenantId, found.review, workflow)
  if (to.length === 0) return { ok: false as const, error: 'No reviewers to remind' }
  const overdue = Boolean(found.review.due_at && new Date(found.review.due_at).getTime() < Date.now())
  const msg = reviewReminder({ tenantName: tenant.display_name, reviewName: found.review.name, pending, dueAt: found.review.due_at, overdue, origin: await publicOrigin(), reviewId })
  const res = await sendMail(tenant, { kind: 'review_reminder', to, subject: msg.subject, html: msg.html, relatedType: 'access_review', relatedId: reviewId })
  if (res.ok) {
    mustWrite(
      'access_reviews last_reminder_at',
      await supabase.from('access_reviews').update({ last_reminder_at: new Date().toISOString() }).eq('id', reviewId),
    )
  }
  return res
}

/**
 * Daily sweep: send one reminder per active review when it is within the
 * configured window before its due date (or overdue), at most once per day.
 */
export async function sendDueReminders(tenantId: string) {
  const tenant = await loadMailTenant(tenantId)
  if (!tenant) return 0
  const workflow = reviewWorkflowOf(tenant.settings)
  if (!workflow.notify_reviewers) return 0
  const horizon = new Date(Date.now() + workflow.reminder_days_before_due * 86_400_000).toISOString()
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const { data: reviews } = await db().from('access_reviews').select('id,last_reminder_at').eq('tenant_id', tenantId).eq('status', 'active').lte('due_at', horizon)
  let sent = 0
  for (const r of reviews ?? []) {
    if (r.last_reminder_at && (r.last_reminder_at as string) > dayAgo) continue
    const res = await remindReviewers(tenantId, r.id as string)
    if (res.ok && !('skipped' in res && res.skipped)) sent += 1
  }
  return sent
}
