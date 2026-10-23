import { Suspense } from 'react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getCauseCounts, getGuestDomains, listGuests, type GuestFilters as Filters } from '@/lib/data/guests'
import { isRiskCause } from '@/lib/risk/recommendation'
import { getReviewScopeCounts } from '@/lib/data/dashboard'
import { reviewWorkflowOf } from '@/lib/reviews/workflow'
import { PageHeader } from '@/components/layout/page-header'
import { GuestFilters } from '@/components/guests/guest-filters'
import { GuestTable } from '@/components/guests/guest-table'
import { CauseGroups } from '@/components/guests/cause-groups'
import { Pagination } from '@/components/layout/pagination'
import { formatNumber } from '@/lib/format'

export const metadata = { title: 'External identities' }

type SP = Record<string, string | undefined>

export default async function GuestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { session, tenant } = await requireOnboarded()
  const cause = isRiskCause(sp.cause) ? sp.cause : undefined
  const filters: Filters = {
    q: sp.q,
    risk: sp.risk as Filters['risk'],
    domain: sp.domain,
    status: sp.status as Filters['status'],
    activity: sp.activity as Filters['activity'],
    sponsor: sp.sponsor as Filters['sponsor'],
    review: sp.review as Filters['review'],
    action: sp.action,
    cause,
    sort: sp.sort as Filters['sort'],
    page: Number(sp.page ?? 1),
  }
  const groupedRisk = filters.risk === 'high' || filters.risk === 'critical' ? filters.risk : null
  const [{ guests, total, page, pageSize }, domains, causeCounts, scopeCounts] = await Promise.all([
    listGuests(tenant.id, filters),
    getGuestDomains(tenant.id),
    groupedRisk ? getCauseCounts(tenant.id, groupedRisk) : Promise.resolve(null),
    getReviewScopeCounts(tenant.id),
  ])
  const workflow = reviewWorkflowOf(tenant.settings)
  const exportParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])
  exportParams.set('type', 'guests')

  return (
    <>
      <PageHeader title="External identities" description={`${formatNumber(total)} external identities match. Scores combine inactivity, sponsorship, domain trust, and sensitive-resource exposure.`} />
      <Suspense>
        <GuestFilters domains={domains} />
      </Suspense>
      {groupedRisk && causeCounts && <CauseGroups risk={groupedRisk} counts={causeCounts} total={total} activeCause={cause} params={sp} />}
      <GuestTable
        guests={guests}
        canReview={can(session.role, 'review.create')}
        canExport={can(session.role, 'export')}
        exportHref={`/api/export?${exportParams.toString()}`}
        scopeCounts={scopeCounts}
        defaultReviewerEmails={workflow.default_reviewer_emails}
      />
      <Pagination page={page} pageSize={pageSize} total={total} basePath="/guests" params={sp} />
    </>
  )
}
