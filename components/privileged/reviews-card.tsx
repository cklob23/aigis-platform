import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, formatNumber } from '@/lib/format'
import type { PrivilegedReviewsSummary } from '@/lib/privileged/view'

export function PrivilegedReviewsCard({ reviews }: { reviews: PrivilegedReviewsSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privileged reviews</CardTitle>
        <CardDescription>Access reviews of privileged role assignments. Cadence is fixed at 90 days.</CardDescription>
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
          <span className="tnum font-medium">{reviews.nextDueAt ? formatDate(reviews.nextDueAt) : '—'}</span>
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
