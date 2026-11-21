import { notFound } from 'next/navigation'
import { requireOnboarded } from '@/lib/auth/current'
import { can, canExportPrivileged, canViewPrivilegedDetail, canViewPrivilegedSummary } from '@/lib/auth/rbac'
import { parsePrivilegedSettings, privilegedPagesEnabled } from '@/lib/privileged/capability'
import { getPrivilegedDetail, getPrivilegedSummary } from '@/lib/data/privileged'
import { PrivilegedPage } from '@/components/privileged/privileged-page'
import { ReadOnlySummary } from '@/components/privileged/read-only-summary'
import type { PrivilegedTab } from '@/components/privileged/privileged-tabs'

export const metadata = { title: 'Privileged access' }

type SP = Record<string, string | undefined>

export default async function PrivilegedAccessPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { session, tenant } = await requireOnboarded()
  if (!privilegedPagesEnabled(tenant.settings) || !canViewPrivilegedSummary(session.role)) notFound()

  const pim = parsePrivilegedSettings(tenant.settings).capability?.pim ?? 'unknown'
  const tab = (['overview', 'holders', 'roles', 'remediation'] as const).includes(sp.tab as PrivilegedTab)
    ? (sp.tab as PrivilegedTab)
    : 'overview'

  if (!canViewPrivilegedDetail(session.role)) {
    const summary = await getPrivilegedSummary(tenant.id, tenant.settings)
    return <ReadOnlySummary summary={summary} pim={pim} tenantName={tenant.display_name} />
  }

  const detail = await getPrivilegedDetail(tenant.id, session.role, tenant.settings)
  return (
    <PrivilegedPage
      tenantName={tenant.display_name}
      pim={pim}
      detail={detail}
      canExport={canExportPrivileged(session.role)}
      canRecheck={can(session.role, 'settings.manage')}
      exportHref="/api/export?type=privileged"
      initialTab={tab}
    />
  )
}
