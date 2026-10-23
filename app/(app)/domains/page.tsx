import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listDomains } from '@/lib/data/domains'
import { listOrganizationOptions } from '@/lib/data/organizations'
import { PageHeader } from '@/components/layout/page-header'
import { DomainTable } from '@/components/domains/domain-table'
import { Button } from '@/components/ui/button'
import { DOMAIN_CLASSIFICATION_LABELS, type DomainClassification } from '@/lib/types'
import { cn } from '@/lib/utils'

export const metadata = { title: 'External domains' }

const FILTERS: (DomainClassification | 'all')[] = ['all', 'unknown', 'blocked', 'temporary', 'vendor', 'contractor', 'client', 'approved_partner']

export default async function DomainsPage({ searchParams }: { searchParams: Promise<{ classification?: string }> }) {
  const { classification = 'all' } = await searchParams
  const { session, tenant } = await requireOnboarded()
  const [all, orgOptions] = await Promise.all([listDomains(tenant.id), listOrganizationOptions(tenant.id)])
  const orgNames = Object.fromEntries(orgOptions.map((o) => [o.id, o.name]))
  const domains = classification === 'all' ? all : all.filter((d) => d.classification === classification)
  const counts = all.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.classification]: (acc[d.classification] ?? 0) + 1 }), {})
  const unknownGuests = all.filter((d) => d.classification === 'unknown').reduce((s, d) => s + d.guest_count, 0)
  const canClassify = can(session.role, 'domain.classify')

  return (
    <>
      <PageHeader
        eyebrow="External organizations"
        title="Domains"
        description={
          <>
            {all.length} sign-in domains. {counts.unknown ?? 0} unclassified domains account for {unknownGuests} identities. Governance decisions now live on{' '}
            <Link href="/organizations" className="underline underline-offset-4">
              external organizations
            </Link>
            ; domain classification is kept for risk scoring and legacy filters.
          </>
        }
        actions={
          can(session.role, 'export') ? (
            <Button variant="outline" nativeButton={false} render={<a href="/api/export?type=domains" />}>
              <Download data-icon="inline-start" /> Export CSV
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by classification">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'all' ? '/domains' : `/domains?classification=${f}`}
            role="tab"
            aria-selected={classification === f}
            className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent', classification === f ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
          >
            {f === 'all' ? 'All' : DOMAIN_CLASSIFICATION_LABELS[f]}
            <span className="tnum ml-1.5 font-mono">{f === 'all' ? all.length : counts[f] ?? 0}</span>
          </Link>
        ))}
      </div>

      <DomainTable domains={domains} orgNames={orgNames} canClassify={canClassify} />
    </>
  )
}
