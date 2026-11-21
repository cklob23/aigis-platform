import { PageHeader } from '@/components/layout/page-header'
import { PrivilegedOverview } from '@/components/privileged/overview'
import { PimBanner } from '@/components/privileged/pim-banner'
import { READ_ONLY_PRIVILEGED_DESCRIPTION } from '@/lib/privileged/copy'
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
        description={READ_ONLY_PRIVILEGED_DESCRIPTION}
      />
      <PimBanner pim={pim} />
      <PrivilegedOverview summary={summary} links={false} />
    </>
  )
}
