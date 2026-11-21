import { Suspense } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { PrivilegedTabs, type PrivilegedTab } from '@/components/privileged/privileged-tabs'
import { PrivilegedOverview } from '@/components/privileged/overview'
import { HoldersTable } from '@/components/privileged/holders-table'
import { RolesTable } from '@/components/privileged/roles-table'
import { RemediationPlaceholder } from '@/components/privileged/remediation-placeholder'
import { PimBanner } from '@/components/privileged/pim-banner'
import { PimRecheckButton } from '@/components/privileged/pim-recheck-button'
import { privilegedDashboardCardSubtitle } from '@/lib/privileged/copy'
import type { PrivilegedPimStatus } from '@/lib/types'
import type { PrivilegedDetail } from '@/lib/privileged/view'

export function PrivilegedPage({
  tenantName,
  pim,
  detail,
  canExport,
  canRecheck,
  exportHref,
  initialTab = 'overview',
}: {
  tenantName: string
  pim: PrivilegedPimStatus
  detail: PrivilegedDetail
  canExport: boolean
  canRecheck: boolean
  exportHref: string
  initialTab?: PrivilegedTab
}) {
  const privilegedRoles = detail.roles.filter((row) => row.isPrivileged).length
  return (
    <>
      <PageHeader
        eyebrow={tenantName}
        title="Privileged access"
        description={privilegedDashboardCardSubtitle(detail.summary.holders, detail.summary.assignments)}
        actions={
          canExport ? (
            <Button variant="outline" nativeButton={false} render={<Link href={exportHref} />}>
              Export CSV
            </Button>
          ) : null
        }
      />
      <PimBanner pim={pim} recheck={<PimRecheckButton canRecheck={canRecheck} />} />
      <PrivilegedTabs
        initial={initialTab}
        counts={{
          holders: detail.summary.holders,
          roles: privilegedRoles,
        }}
        panels={{
          overview: <PrivilegedOverview summary={detail.summary} highestRisk={detail.highestRisk} />,
          holders: (
            <Suspense>
              <HoldersTable
                holders={detail.holders}
                pimAvailable={detail.summary.pimAvailable}
                totalIdentities={detail.summary.holders}
              />
            </Suspense>
          ),
          roles: <RolesTable roles={detail.roles} pimAvailable={detail.summary.pimAvailable} />,
          remediation: <RemediationPlaceholder />,
        }}
      />
    </>
  )
}
