import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { requireOnboarded } from '@/lib/auth/current'
import { canViewPrivilegedDetail } from '@/lib/auth/rbac'
import { aiExplainEnabled } from '@/lib/ai/recommend'
import { privilegedPagesEnabled } from '@/lib/privileged/capability'
import { getPrivilegedIdentity } from '@/lib/data/privileged'
import { PageHeader } from '@/components/layout/page-header'
import { IdentityProfile } from '@/components/privileged/identity-profile'
import { PRIVILEGED_DETAIL_DENIED } from '@/lib/privileged/copy'

type Params = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  try {
    const { session, tenant } = await requireOnboarded()
    if (!privilegedPagesEnabled(tenant.settings) || !canViewPrivilegedDetail(session.role)) {
      return { title: 'Privileged identity' }
    }
    const profile = await getPrivilegedIdentity(tenant.id, session.role, tenant.settings, id, { isDemo: tenant.is_demo })
    const name = profile?.displayName ?? profile?.identifier
    return { title: name ? `${name} | Privileged access` : 'Privileged identity' }
  } catch {
    return { title: 'Privileged identity' }
  }
}

export default async function PrivilegedIdentityPage({ params }: Params) {
  const { id } = await params
  const { session, tenant } = await requireOnboarded()
  if (!privilegedPagesEnabled(tenant.settings)) notFound()
  if (!canViewPrivilegedDetail(session.role)) {
    return <PageHeader title="Privileged identity" description={PRIVILEGED_DETAIL_DENIED} />
  }
  const profile = await getPrivilegedIdentity(tenant.id, session.role, tenant.settings, id, { isDemo: tenant.is_demo })
  if (!profile) notFound()
  const aiEnabled = aiExplainEnabled(tenant.settings)
  return <IdentityProfile profile={profile} aiEnabled={aiEnabled} />
}
