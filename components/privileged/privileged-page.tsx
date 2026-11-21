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
import type { PrivilegedPimStatus } from '@/lib/types'
import type { PrivilegedDetail } from '@/lib/privileged/view'

export function PrivilegedPage({
  tenantName,
  pim,
  detail,
  canExport,
  exportHref,
  initialTab = 'overview',
}: {
  tenantName: string
  pim: PrivilegedPimStatus
  detail: PrivilegedDetail
  canExport: boolean
  exportHref: string
  initialTab?: PrivilegedTab
}) {
  return (
    <>
      <PageHeader
        eyebrow={tenantName}
        title="Privileged access"
        description={`${detail.summary.holders} privileged identities across directory roles. Standing assignments, eligible (JIT), and review cadence live here.`}
        actions={
          canExport ? (
            <Button variant="outline" nativeButton={false} render={<Link href={exportHref} />}>
              Export
            </Button>
          ) : null
        }
      />
      <PimBanner pim={pim} />
      <PrivilegedTabs
        initial={initialTab}
        panels={{
          overview: <PrivilegedOverview summary={detail.summary} />,
          holders: (
            <Suspense>
              <HoldersTable holders={detail.holders} pimAvailable={detail.summary.pimAvailable} />
            </Suspense>
          ),
          roles: <RolesTable roles={detail.roles} pimAvailable={detail.summary.pimAvailable} />,
          remediation: <RemediationPlaceholder />,
        }}
      />
    </>
  )
}
