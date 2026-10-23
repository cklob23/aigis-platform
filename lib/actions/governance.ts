'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireContext, assertCan } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { rescoreTenant } from '@/lib/scan/engine'
import { normalizeEmails } from '@/lib/email/mailer'
import { isApprover, notifyApprovers, notifyRequester, notifyReviewers, remindReviewers, reviewWorkflowOf } from '@/lib/reviews/workflow'
import type { DomainClassification, ResourceType, ReviewWorkflowSettings, ReviewScopeKind, ReviewReviewerKind, ReviewRecurrence, ReviewNoResponseAction } from '@/lib/types'

type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }
}

export async function classifyDomain(input: { domainId: string; classification: DomainClassification; businessOwner?: string; reviewDate?: string; notes?: string; reason?: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'domain.classify')
    const supabase = db()
    const { data: prev } = await supabase.from('external_domains').select('*').eq('tenant_id', tenant.id).eq('id', input.domainId).single()
    if (!prev) return { ok: false, error: 'Domain not found' }
    await supabase
      .from('external_domains')
      .update({ classification: input.classification, business_owner: input.businessOwner || null, review_date: input.reviewDate || null, notes: input.notes || null })
      .eq('tenant_id', tenant.id)
      .eq('id', input.domainId)
    await audit(session, {
      action: 'domain.classified',
      targetType: 'external_domain',
      targetId: input.domainId,
      targetLabel: prev.domain,
      previousState: { classification: prev.classification, business_owner: prev.business_owner, review_date: prev.review_date },
      newState: { classification: input.classification, business_owner: input.businessOwner, review_date: input.reviewDate },
      reason: input.reason,
    })
    if (prev.classification !== input.classification) await rescoreTenant(tenant.id, null)
    revalidatePath('/domains')
    revalidatePath(`/domains/${encodeURIComponent(prev.domain)}`)
    revalidatePath('/guests')
    revalidatePath('/dashboard')
    return { ok: true, message: `${prev.domain} classified as ${input.classification.replace('_', ' ')}` }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Classify and/or assign an owner to many domains at once. Fields left undefined are untouched,
 * so an admin can set an owner without disturbing an existing classification (or vice versa).
 */
export async function bulkClassifyDomains(input: { domainIds: string[]; classification?: DomainClassification; businessOwner?: string; reviewDate?: string; reason?: string }): Promise<ActionResult & { updated?: number }> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'domain.classify')
    const ids = Array.from(new Set(input.domainIds)).filter(Boolean)
    if (ids.length === 0) return { ok: false, error: 'Select at least one domain.' }
    const owner = input.businessOwner?.trim()
    if (!input.classification && !owner && !input.reviewDate) return { ok: false, error: 'Choose a classification or enter an owner to apply.' }

    const supabase = db()
    const { data: rows } = await supabase.from('external_domains').select('id,domain,classification,business_owner,review_date').eq('tenant_id', tenant.id).in('id', ids)
    if (!rows?.length) return { ok: false, error: 'No matching domains found.' }

    const patch: Record<string, unknown> = {}
    if (input.classification) patch.classification = input.classification
    if (owner) patch.business_owner = owner
    if (input.reviewDate) patch.review_date = input.reviewDate
    await supabase.from('external_domains').update(patch).eq('tenant_id', tenant.id).in('id', rows.map((r) => r.id as string))

    const correlationId = `bulk-${Date.now().toString(36)}`
    for (const prev of rows) {
      await audit(session, {
        action: 'domain.classified',
        targetType: 'external_domain',
        targetId: prev.id as string,
        targetLabel: prev.domain as string,
        previousState: { classification: prev.classification, business_owner: prev.business_owner, review_date: prev.review_date },
        newState: { classification: input.classification ?? prev.classification, business_owner: owner ?? prev.business_owner, review_date: input.reviewDate ?? prev.review_date, bulk: rows.length },
        reason: input.reason,
        correlationId,
      })
    }
    if (input.classification && rows.some((r) => r.classification !== input.classification)) await rescoreTenant(tenant.id, null)
    revalidatePath('/domains')
    revalidatePath('/guests')
    revalidatePath('/dashboard')
    const what = [input.classification && `classified as ${input.classification.replace('_', ' ')}`, owner && `owner set to ${owner}`].filter(Boolean).join(', ')
    return { ok: true, updated: rows.length, message: `${rows.length} domain${rows.length === 1 ? '' : 's'} ${what}` }
  } catch (err) {
    return fail(err)
  }
}

/** Resolves a wizard scope to concrete guest ids. Selected scope passes through unchanged. */
async function resolveScope(tenantId: string, scope: ReviewScopeKind, selected: string[]): Promise<string[]> {
  if (scope === 'selected') return selected
  let q = db().from('guest_identities').select('id').eq('tenant_id', tenantId).is('removed_at', null)
  if (scope === 'high_critical') q = q.in('risk_level', ['high', 'critical'])
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => r.id as string)
}

export async function createAccessReview(input: {
  name: string
  description?: string
  dueInDays: number
  guestIds: string[]
  reviewerEmails?: string
  scopeKind?: ReviewScopeKind
  reviewerKind?: ReviewReviewerKind
  recurrence?: ReviewRecurrence
  noResponseAction?: ReviewNoResponseAction
}): Promise<ActionResult & { reviewId?: string; needsApproval?: boolean }> {
  try {
  const { session, tenant } = await requireContext()
  assertCan(session, 'review.create')
  if (!input.name.trim()) return { ok: false, error: 'Name is required' }
  const scopeKind: ReviewScopeKind = input.scopeKind ?? 'selected'
  const guestIds = await resolveScope(tenant.id, scopeKind, input.guestIds)
  if (guestIds.length === 0) return { ok: false, error: scopeKind === 'selected' ? 'Select at least one guest' : 'No identities match that scope' }
  input = { ...input, guestIds }
    const workflow = reviewWorkflowOf(tenant.settings)
    // Approvers (and admins who can manage settings) bypass the approval gate for their own reviews.
    const needsApproval = workflow.require_approval && workflow.approver_emails.length > 0 && !isApprover(workflow, session.email) && !can(session.role, 'settings.manage')
    const reviewerEmails = normalizeEmails(input.reviewerEmails ?? '')
    const reviewers = reviewerEmails.length ? reviewerEmails : workflow.default_reviewer_emails
    const supabase = db()
    const { data: review, error } = await supabase
      .from('access_reviews')
      .insert({
        tenant_id: tenant.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        status: needsApproval ? 'draft' : 'active',
        approval_status: needsApproval ? 'pending' : 'not_required',
        approval_requested_at: needsApproval ? new Date().toISOString() : null,
        reviewer_emails: reviewers,
        created_by: session.demo ? null : session.userId,
        created_by_email: session.email,
        due_at: new Date(Date.now() + input.dueInDays * 86_400_000).toISOString(),
        scope: {
  guest_count: input.guestIds.length,
  kind: scopeKind,
  reviewer_kind: input.reviewerKind ?? 'sponsor',
  recurrence: input.recurrence ?? 'once',
  // Recorded for the review record only. Monitor-only: AIGIS never executes removals from this setting.
  no_response_action: input.noResponseAction ?? 'keep',
  },
      })
      .select('id')
      .single()
    if (error) throw error
    const { data: memberships } = await supabase.from('resource_memberships').select('guest_id, resource:resources(id,display_name,resource_type,is_sensitive)').eq('tenant_id', tenant.id).in('guest_id', input.guestIds).is('removed_at', null)
    const snapByGuest = new Map<string, { id: string; name: string; type: ResourceType; sensitive: boolean }[]>()
    for (const m of memberships ?? []) {
      const r = m.resource as unknown as { id: string; display_name: string; resource_type: ResourceType; is_sensitive: boolean } | null
      if (!r) continue
      const list = snapByGuest.get(m.guest_id as string) ?? []
      list.push({ id: r.id, name: r.display_name, type: r.resource_type, sensitive: r.is_sensitive })
      snapByGuest.set(m.guest_id as string, list)
    }
    await supabase.from('review_items').insert(input.guestIds.map((gid) => ({ tenant_id: tenant.id, review_id: review.id, guest_id: gid, resources_snapshot: snapByGuest.get(gid) ?? [] })))
    await supabase.from('guest_identities').update({ review_status: 'pending' }).eq('tenant_id', tenant.id).in('id', input.guestIds)
    await audit(session, { action: 'review.created', targetType: 'access_review', targetId: review.id, targetLabel: input.name, newState: { guests: input.guestIds.length, due_in_days: input.dueInDays, needs_approval: needsApproval, reviewers } })

    let notice = ''
    if (needsApproval) {
      const res = await notifyApprovers(tenant.id, review.id as string, session.email)
      notice = res.ok ? ' Approvers have been emailed.' : ` Approval email failed: ${res.error}`
      await audit(session, { action: 'review.approval_requested', targetType: 'access_review', targetId: review.id, targetLabel: input.name, newState: { approvers: workflow.approver_emails, emailed: res.ok } })
    } else {
      const res = await notifyReviewers(tenant.id, review.id as string)
      if (res.ok && !res.skipped) notice = ' Reviewers have been emailed.'
      else if (!res.ok) notice = ` Reviewer email failed: ${res.error}`
    }
    revalidatePath('/reviews')
    revalidatePath('/guests')
    revalidatePath('/settings/reviews')
    return {
      ok: true,
      reviewId: review.id as string,
      needsApproval,
      message: needsApproval ? `Review submitted for approval with ${input.guestIds.length} identities.${notice}` : `Review created with ${input.guestIds.length} identities.${notice}`,
    }
  } catch (err) {
    return fail(err)
  }
}

export async function approveReview(input: { reviewId: string; note?: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    const workflow = reviewWorkflowOf(tenant.settings)
    if (!isApprover(workflow, session.email) && !can(session.role, 'settings.manage')) return { ok: false, error: 'Only configured approvers or administrators can approve reviews.' }
    const supabase = db()
    const { data: review } = await supabase.from('access_reviews').select('id,name,approval_status,status').eq('tenant_id', tenant.id).eq('id', input.reviewId).maybeSingle()
    if (!review) return { ok: false, error: 'Review not found' }
    if (review.approval_status !== 'pending') return { ok: false, error: 'This review is not awaiting approval.' }
    const now = new Date().toISOString()
    await supabase
      .from('access_reviews')
      .update({ status: 'active', approval_status: 'approved', approved_by: session.demo ? null : session.userId, approved_by_email: session.email, approved_at: now, approval_note: input.note?.trim() || null })
      .eq('tenant_id', tenant.id)
      .eq('id', input.reviewId)
    await audit(session, { action: 'review.approved', targetType: 'access_review', targetId: input.reviewId, targetLabel: review.name as string, reason: input.note })
    const [reviewers, requester] = await Promise.all([notifyReviewers(tenant.id, input.reviewId, session.email), notifyRequester(tenant.id, input.reviewId, true, session.email, input.note)])
    revalidatePath('/reviews')
    revalidatePath(`/reviews/${input.reviewId}`)
    revalidatePath('/settings/reviews')
    const parts = ['Review approved.']
    if (reviewers.ok && !reviewers.skipped) parts.push('Reviewers emailed.')
    else if (!reviewers.ok) parts.push(`Reviewer email failed: ${reviewers.error}`)
    if (!requester.ok) parts.push(`Requester email failed: ${requester.error}`)
    return { ok: true, message: parts.join(' ') }
  } catch (err) {
    return fail(err)
  }
}

export async function rejectReview(input: { reviewId: string; note?: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    const workflow = reviewWorkflowOf(tenant.settings)
    if (!isApprover(workflow, session.email) && !can(session.role, 'settings.manage')) return { ok: false, error: 'Only configured approvers or administrators can reject reviews.' }
    const supabase = db()
    const { data: review } = await supabase.from('access_reviews').select('id,name,approval_status').eq('tenant_id', tenant.id).eq('id', input.reviewId).maybeSingle()
    if (!review) return { ok: false, error: 'Review not found' }
    if (review.approval_status !== 'pending') return { ok: false, error: 'This review is not awaiting approval.' }
    const now = new Date().toISOString()
    await supabase
      .from('access_reviews')
      .update({ status: 'cancelled', approval_status: 'rejected', approved_by: session.demo ? null : session.userId, approved_by_email: session.email, approved_at: now, approval_note: input.note?.trim() || null, completed_at: now })
      .eq('tenant_id', tenant.id)
      .eq('id', input.reviewId)
    const { data: items } = await supabase.from('review_items').select('guest_id').eq('tenant_id', tenant.id).eq('review_id', input.reviewId)
    const guestIds = (items ?? []).map((i) => i.guest_id as string)
    if (guestIds.length) await supabase.from('guest_identities').update({ review_status: 'never_reviewed' }).eq('tenant_id', tenant.id).in('id', guestIds).eq('review_status', 'pending')
    await audit(session, { action: 'review.rejected', targetType: 'access_review', targetId: input.reviewId, targetLabel: review.name as string, reason: input.note })
    await notifyRequester(tenant.id, input.reviewId, false, session.email, input.note)
    revalidatePath('/reviews')
    revalidatePath(`/reviews/${input.reviewId}`)
    revalidatePath('/settings/reviews')
    revalidatePath('/guests')
    return { ok: true, message: 'Review rejected. The requester has been notified.' }
  } catch (err) {
    return fail(err)
  }
}

export async function sendReviewReminder(reviewId: string): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'review.create')
    const res = await remindReviewers(tenant.id, reviewId)
    await audit(session, { action: 'review.reminder_sent', targetType: 'access_review', targetId: reviewId, newState: { ok: res.ok } })
    revalidatePath(`/reviews/${reviewId}`)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, message: res.skipped ? 'Nothing pending to remind about.' : 'Reminder sent to reviewers.' }
  } catch (err) {
    return fail(err)
  }
}

export async function updateReviewerEmails(input: { reviewId: string; reviewerEmails: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'review.create')
    const reviewers = normalizeEmails(input.reviewerEmails)
    await db().from('access_reviews').update({ reviewer_emails: reviewers }).eq('tenant_id', tenant.id).eq('id', input.reviewId)
    await audit(session, { action: 'review.reviewers_updated', targetType: 'access_review', targetId: input.reviewId, newState: { reviewers } })
    revalidatePath(`/reviews/${input.reviewId}`)
    return { ok: true, message: 'Reviewers updated' }
  } catch (err) {
    return fail(err)
  }
}

export async function updateReviewWorkflow(input: ReviewWorkflowSettings): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'settings.manage')
    const next: ReviewWorkflowSettings = {
      require_approval: Boolean(input.require_approval),
      approver_emails: normalizeEmails(input.approver_emails),
      default_reviewer_emails: normalizeEmails(input.default_reviewer_emails),
      notify_reviewers: Boolean(input.notify_reviewers),
      notify_sponsors: Boolean(input.notify_sponsors),
      reminder_days_before_due: Math.min(30, Math.max(0, Number(input.reminder_days_before_due) || 0)),
      default_due_days: Math.min(90, Math.max(1, Number(input.default_due_days) || 14)),
    }
    if (next.require_approval && next.approver_emails.length === 0) return { ok: false, error: 'Add at least one approver email before requiring approval.' }
    const prev = tenant.settings.review_workflow ?? null
    await db().from('tenants').update({ settings: { ...tenant.settings, review_workflow: next } }).eq('id', tenant.id)
    await audit(session, { action: 'settings.review_workflow_updated', targetType: 'tenant', targetId: tenant.id, previousState: prev, newState: next })
    revalidatePath('/settings/reviews')
    return { ok: true, message: 'Review workflow saved' }
  } catch (err) {
    return fail(err)
  }
}

export async function decideReviewItem(input: { itemId: string; decision: 'approve' | 'remove' | 'extend' | 'investigate'; comment?: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'review.decide')
    const supabase = db()
    const { data: item } = await supabase.from('review_items').select('*, guest:guest_identities(id,display_name,email), review:access_reviews(status)').eq('tenant_id', tenant.id).eq('id', input.itemId).single()
    if (!item) return { ok: false, error: 'Review item not found' }
    const parentStatus = (item.review as unknown as { status: string } | null)?.status
    if (parentStatus !== 'active') return { ok: false, error: parentStatus === 'draft' ? 'This review is awaiting approval.' : 'This review is no longer active.' }
    const now = new Date().toISOString()
    await supabase.from('review_items').update({ status: 'decided', decision: input.decision, decided_at: now }).eq('id', input.itemId)
    await supabase.from('review_decisions').insert({ tenant_id: tenant.id, review_item_id: input.itemId, reviewer_user_id: session.demo ? null : session.userId, reviewer_email: session.email, decision: input.decision, comment: input.comment || null, resources_reviewed: item.resources_snapshot })
    const reviewStatus = input.decision === 'approve' ? 'approved' : input.decision === 'extend' ? 'extended' : input.decision === 'investigate' ? 'investigating' : 'pending'
    await supabase.from('guest_identities').update({ review_status: reviewStatus, last_reviewed_at: input.decision === 'approve' || input.decision === 'extend' ? now : undefined }).eq('id', item.guest_id)
    const guest = item.guest as unknown as { display_name: string | null; email: string | null }
    await audit(session, { action: 'review.decided', targetType: 'review_item', targetId: input.itemId, targetLabel: guest?.display_name ?? guest?.email ?? item.guest_id, newState: { decision: input.decision }, reason: input.comment })
    revalidatePath(`/reviews/${item.review_id}`)
    revalidatePath(`/guests/${item.guest_id}`)
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function completeReview(reviewId: string): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'review.create')
    const supabase = db()
    const { count } = await supabase.from('review_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).eq('review_id', reviewId).eq('status', 'pending')
    if ((count ?? 0) > 0) return { ok: false, error: `${count} items still pending a decision` }
    await supabase.from('access_reviews').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('id', reviewId)
    await audit(session, { action: 'review.completed', targetType: 'access_review', targetId: reviewId })
    revalidatePath('/reviews')
    revalidatePath(`/reviews/${reviewId}`)
    return { ok: true, message: 'Review completed' }
  } catch (err) {
    return fail(err)
  }
}

export async function acknowledgeAlert(alertId: string): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'review.decide')
    await db().from('alerts').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('id', alertId)
    await audit(session, { action: 'alert.acknowledged', targetType: 'alert', targetId: alertId })
    revalidatePath('/alerts')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function dismissFinding(findingId: string): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'review.decide')
    await db().from('risk_findings').update({ status: 'dismissed', resolved_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('id', findingId)
    await audit(session, { action: 'finding.dismissed', targetType: 'risk_finding', targetId: findingId })
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function createReviewFromSelectionAndGo(formData: FormData) {
  const guestIds = String(formData.get('guestIds') ?? '').split(',').filter(Boolean)
  const name = String(formData.get('name') ?? 'Guest access review')
  const res = await createAccessReview({ name, dueInDays: Number(formData.get('dueInDays') ?? 14), guestIds })
  if (res.ok && res.reviewId) redirect(`/reviews/${res.reviewId}`)
  return res
}
