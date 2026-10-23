import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardCheck, Clock } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listReviews } from '@/lib/data/governance'
import { getReviewScopeCounts } from '@/lib/data/dashboard'
import { reviewWorkflowOf } from '@/lib/reviews/workflow'
import { PageHeader } from '@/components/layout/page-header'
import { NewReviewWizard } from '@/components/reviews/new-review-wizard'
import { ReviewTabs } from '@/components/reviews/review-tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { formatDate, relativeDays } from '@/lib/format'
import { REVIEW_RECURRENCE_LABELS, REVIEW_REVIEWER_LABELS, type ReviewRecurrence, type ReviewReviewerKind } from '@/lib/types'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Access reviews' }

export default async function ReviewsPage() {
  const { session, tenant } = await requireOnboarded()
  const canCreate = can(session.role, 'review.create')
  const [reviews, scopeCounts] = await Promise.all([listReviews(tenant.id), getReviewScopeCounts(tenant.id)])
  const workflow = reviewWorkflowOf(tenant.settings)

  const isOverdue = (r: (typeof reviews)[number]) => r.status === 'active' && !!r.due_at && new Date(r.due_at).getTime() < Date.now()
  const overdue = reviews.filter(isOverdue)
  const active = reviews.filter((r) => (r.status === 'active' || r.status === 'draft') && !isOverdue(r))
  const completed = reviews.filter((r) => r.status !== 'active' && r.status !== 'draft')

  const Row = ({ r }: { r: (typeof reviews)[number] }) => {
    const pct = r.total ? Math.round((r.decided / r.total) * 100) : 0
    const scope = (r.scope ?? {}) as { reviewer_kind?: ReviewReviewerKind; recurrence?: ReviewRecurrence }
    return (
      <Link href={`/reviews/${r.id}`} className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2 font-medium">
            {r.name}
            <Badge variant="outline" className={cn('capitalize', r.status === 'completed' && 'border-success/40 text-success')}>
              {r.status}
            </Badge>
            {r.approval_status === 'pending' && (
              <Badge variant="outline" className="border-warning/40 text-warning">
                Awaiting approval
              </Badge>
            )}
            {r.approval_status === 'rejected' && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                Rejected
              </Badge>
            )}
            {isOverdue(r) && <Badge variant="destructive">Overdue</Badge>}
          </span>
          <span className="text-muted-foreground text-xs">
            {r.description ?? 'No description'} · created {formatDate(r.created_at)}
            {r.due_at && ` · due ${relativeDays(r.due_at)}`}
            {scope.reviewer_kind && ` · ${REVIEW_REVIEWER_LABELS[scope.reviewer_kind]?.label ?? scope.reviewer_kind}`}
            {scope.recurrence && scope.recurrence !== 'once' && ` · ${REVIEW_RECURRENCE_LABELS[scope.recurrence]}`}
          </span>
        </div>
        <div className="flex items-center gap-4 md:w-96">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex justify-between font-mono text-xs">
              <span>
                {r.decided}/{r.total} decided
              </span>
              <span className="text-muted-foreground">{r.removals} removals</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
          <span className="tnum w-10 text-right font-mono text-sm">{pct}%</span>
        </div>
      </Link>
    )
  }

  const List = ({ items }: { items: typeof reviews }) => (
    <div className="flex flex-col gap-3">
      {items.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </div>
  )

  const firstRunEmpty = (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardCheck />
        </EmptyMedia>
        <EmptyTitle>No access reviews yet</EmptyTitle>
        <EmptyDescription>
          Start one here with <span className="text-foreground">New access review</span> to certify all high and critical identities or the whole external directory, or tick specific guests on External identities and create a review from the
          selection. Decisions are recorded in AIGIS and the audit log; this is not an Entra ID Governance review and needs no P2 license.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          {canCreate && <NewReviewWizard scopeCounts={scopeCounts} defaultReviewerEmails={workflow.default_reviewer_emails} />}
          <Button variant={canCreate ? 'outline' : 'default'} nativeButton={false} render={<Link href="/guests?risk=high" />}>
            Select high-risk identities <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  )

  const quietEmpty = (icon: React.ReactNode, title: string, description: string) => (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )

  return (
    <>
      <PageHeader
        title="Access reviews"
        description="Certify external access with sponsors, resource owners or administrators. Decisions are recorded per guest in AIGIS and the audit log; nothing changes in Entra until an administrator approves remediation."
        actions={canCreate ? <NewReviewWizard scopeCounts={scopeCounts} defaultReviewerEmails={workflow.default_reviewer_emails} /> : null}
      />
      <ReviewTabs
        initial={overdue.length > 0 ? 'overdue' : 'active'}
        counts={{ active: active.length, overdue: overdue.length, completed: completed.length }}
        panels={{
          active: active.length > 0 ? <List items={active} /> : reviews.length === 0 ? firstRunEmpty : quietEmpty(<ClipboardCheck />, 'No active reviews', 'Every review has either passed its due date or been completed. Start a new one from the header.'),
          overdue:
            overdue.length > 0
              ? <List items={overdue} />
              : quietEmpty(<Clock />, 'Nothing overdue', 'A review becomes overdue when its due date passes with decisions still pending. The no-response policy chosen at creation is shown on the review, but is recorded only; AIGIS does not act on it automatically.'),
          completed: completed.length > 0 ? <List items={completed} /> : quietEmpty(<CheckCircle2 />, 'No completed reviews', 'Completed and cancelled reviews stay here as the certification record, with every decision and reviewer preserved in the audit log.'),
        }}
      />
    </>
  )
}
