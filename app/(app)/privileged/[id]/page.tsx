import { notFound } from 'next/navigation'
import { requireOnboarded } from '@/lib/auth/current'
import { canViewPrivilegedDetail } from '@/lib/auth/rbac'
import { privilegedPagesEnabled } from '@/lib/privileged/capability'
import { PageHeader } from '@/components/layout/page-header'
import { PRIVILEGED_DETAIL_DENIED } from '@/lib/privileged/copy'

export const metadata = { title: 'Privileged identity' }

export default async function PrivilegedIdentityPage() {
  const { session, tenant } = await requireOnboarded()
  if (!privilegedPagesEnabled(tenant.settings)) notFound()
  if (!canViewPrivilegedDetail(session.role)) {
    return <PageHeader title="Privileged identity" description={PRIVILEGED_DETAIL_DENIED} />
  }
  notFound()
}
