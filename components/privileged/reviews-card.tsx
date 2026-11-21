import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatNumber } from '@/lib/format'
import { privilegedReviewDueOverdue, type PrivilegedReviewsSummary } from '@/lib/privileged/view'

export function PrivilegedReviewsCard({
  reviews,
  overdueReviews,
  neverReviewed,
}: {
  reviews: PrivilegedReviewsSummary
  overdueReviews?: number
  neverReviewed?: number
}) {
  const overdue = privilegedReviewDueOverdue(reviews.nextDueAt)
  const nextDue = reviews.nextDueAt
    ? overdue
      ? `${formatDate(reviews.nextDueAt)} · overdue`
      : formatDate(reviews.nextDueAt)
    : '—'
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>Privileged reviews</CardTitle>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Preview
          </span>
        </div>
        <CardDescription>
          Access reviews of privileged role assignments. Cadence is fixed at {reviews.cadenceDays} days.
          {typeof overdueReviews === 'number' && typeof neverReviewed === 'number'
            ? ` ${formatNumber(overdueReviews)} overdue, ${formatNumber(neverReviewed)} never reviewed.`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Every</span>
          <span className="tnum font-medium">{reviews.cadenceDays} days</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Last completed</span>
          <span className="tnum font-medium">{reviews.lastCompletedAt ? formatDate(reviews.lastCompletedAt) : '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Next due</span>
          <span className={overdue ? 'tnum font-medium text-warning' : 'tnum font-medium'}>{nextDue}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Open requests</span>
          <span className="tnum font-medium">
            {formatNumber(reviews.openRequests)}
            {reviews.awaitingApproval > 0 ? ` · ${formatNumber(reviews.awaitingApproval)} await approval` : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
