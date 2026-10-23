import Link from 'next/link'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listReviews } from '@/lib/data/governance'
import { isApprover, reviewWorkflowOf } from '@/lib/reviews/workflow'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReviewWorkflowForm } from '@/components/settings/review-workflow-form'
import { ReviewApprovalButtons } from '@/components/reviews/review-approval-buttons'
import { formatDate, relativeDays } from '@/lib/format'

export const metadata = { title: 'Review workflow' }

export default async function ReviewWorkflowPage() {
  const { session, tenant } = await requireOnboarded()
  const workflow = reviewWorkflowOf(tenant.settings)
  const reviews = await listReviews(tenant.id)
  const pendingApproval = reviews.filter((r) => r.approval_status === 'pending')
  const decided = reviews.filter((r) => r.approval_status === 'approved' || r.approval_status === 'rejected').slice(0, 10)
  const canManage = can(session.role, 'settings.manage')
  const canApprove = canManage || isApprover(workflow, session.email)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Review workflow</CardTitle>
          <CardDescription>Who must approve a new access review, who gets assigned, and how reviewers are reminded. Notices are sent through Microsoft Graph using the sender under Alert rules &amp; email.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewWorkflowForm initial={workflow} disabled={!canManage} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Awaiting approval
            {pendingApproval.length > 0 && <Badge variant="outline" className="border-warning/40 text-warning">{pendingApproval.length}</Badge>}
          </CardTitle>
          <CardDescription>Reviews submitted by analysts that need sign-off before reviewers are notified.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {pendingApproval.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/reviews/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                  {r.name}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {r.total} identities · requested by {r.created_by_email ?? 'unknown'} {r.approval_requested_at ? formatDate(r.approval_requested_at, true) : ''}
                  {r.due_at && ` · due ${relativeDays(r.due_at)}`}
                </span>
                {r.description && <span className="text-muted-foreground text-xs">{r.description}</span>}
              </div>
              {canApprove ? <ReviewApprovalButtons reviewId={r.id} reviewName={r.name} /> : <Badge variant="outline">Pending</Badge>}
            </div>
          ))}
          {pendingApproval.length === 0 && <p className="text-muted-foreground text-sm">Nothing waiting for approval.</p>}
        </CardContent>
      </Card>

      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent decisions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {decided.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Link href={`/reviews/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                    {r.name}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {r.approval_status === 'approved' ? 'Approved' : 'Rejected'} by {r.approved_by_email ?? 'unknown'} {r.approved_at ? formatDate(r.approved_at, true) : ''}
                    {r.approval_note && ` · “${r.approval_note}”`}
                  </span>
                </div>
                <Badge variant="outline" className={r.approval_status === 'approved' ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive'}>
                  {r.approval_status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
