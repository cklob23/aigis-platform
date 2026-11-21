import { Lock } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { PrivilegedOverview } from '@/components/privileged/overview'
import { PimBanner } from '@/components/privileged/pim-banner'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { READ_ONLY_PRIVILEGED_DESCRIPTION, READ_ONLY_PRIVILEGED_TITLE, privilegedDashboardCardSubtitle } from '@/lib/privileged/copy'
import type { PrivilegedPimStatus } from '@/lib/types'
import type { PrivilegedSummary } from '@/lib/privileged/view'

export function ReadOnlySummary({
  summary,
  pim,
  tenantName,
}: {
  summary: PrivilegedSummary
  pim: PrivilegedPimStatus
  tenantName: string
}) {
  return (
    <>
      <PageHeader
        eyebrow={tenantName}
        title="Privileged access"
        description={privilegedDashboardCardSubtitle(summary.holders, summary.assignments)}
      />
      <PimBanner pim={pim} />
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <CardTitle>{READ_ONLY_PRIVILEGED_TITLE}</CardTitle>
                <CardDescription>{READ_ONLY_PRIVILEGED_DESCRIPTION}</CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
        <PrivilegedOverview summary={summary} links={false} />
      </div>
    </>
  )
}
