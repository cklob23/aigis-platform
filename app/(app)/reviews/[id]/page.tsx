import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getReviewDetail } from '@/lib/data/governance'
import { isApprover, reviewWorkflowOf } from '@/lib/reviews/workflow'
import { PageHeader } from '@/components/layout/page-header'
import { ReviewItemRow } from '@/components/reviews/review-item-row'
import { CompleteReviewButton } from '@/components/reviews/complete-review-button'
import { ReviewApprovalButtons } from '@/components/reviews/review-approval-buttons'
import { ReviewNotifyPanel } from '@/components/reviews/review-notify-panel'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { StatCard } from '@/components/dashboard/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDate, relativeDays } from '@/lib/format'

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, tenant } = await requireOnboarded()
  const data = await getReviewDetail(tenant.id, id)
  if (!data) notFound()
  const { review, items } = data
  const pending = items.filter((i) => i.status === 'pending').length
  const by = (d: string) => items.filter((i) => i.decision === d).length
  const readOnly = review.status !== 'active'
  const workflow = reviewWorkflowOf(tenant.settings)
  const canApprove = can(session.role, 'settings.manage') || isApprover(workflow, session.email)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/reviews" />}>
          <ArrowLeft data-icon="inline-start" /> Access reviews
        </Button>
      </div>
      <PageHeader
        eyebrow={`Access review · ${review.status}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {review.name}
            {review.due_at && review.status === 'active' && <Badge variant={new Date(review.due_at).getTime() < Date.now() ? 'destructive' : 'outline'}>Due {relativeDays(review.due_at)}</Badge>}
          </span>
        }
        description={`${review.description ?? ''} Created ${formatDate(review.created_at)}.${review.completed_at ? ` Completed ${formatDate(review.completed_at)}.` : ''}`}
        actions={!readOnly && can(session.role, 'review.create') ? <CompleteReviewButton reviewId={review.id} pending={pending} /> : null}
      />

      {review.approval_status === 'pending' && (
        <Alert className="border-warning/40">
          <ShieldAlert className="text-warning" />
          <AlertTitle>Awaiting administrator approval</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>
              Requested by {review.created_by_email ?? 'an analyst'} {review.approval_requested_at ? formatDate(review.approval_requested_at, true) : ''}. Reviewers are notified and decisions open once an approver signs off.
            </span>
            {canApprove && <ReviewApprovalButtons reviewId={review.id} reviewName={review.name} />}
          </AlertDescription>
        </Alert>
      )}
      {review.approval_status === 'rejected' && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Rejected by {review.approved_by_email ?? 'an approver'}</AlertTitle>
          <AlertDescription>{review.approval_note ?? 'No note was provided.'}</AlertDescription>
        </Alert>
      )}

      <ReviewNotifyPanel reviewId={review.id} reviewerEmails={review.reviewer_emails ?? []} notifiedAt={review.reviewers_notified_at} lastReminderAt={review.last_reminder_at} canManage={can(session.role, 'review.create')} active={review.status === 'active'} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Pending" value={pending} tone={pending ? 'warning' : 'default'} />
        <StatCard label="Approved" value={by('approve')} />
        <StatCard label="Extended" value={by('extend')} />
        <StatCard label="Investigating" value={by('investigate')} />
        <StatCard label="Remove" value={by('remove')} tone={by('remove') ? 'critical' : 'default'} />
      </section>

      <ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
        {items.map((item) => (
          <ReviewItemRow key={item.id} item={item} canDecide={can(session.role, 'review.decide')} readOnly={readOnly} />
        ))}
      </ul>
    </>
  )
}
