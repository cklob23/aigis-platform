import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listOrganizations } from '@/lib/data/organizations'
import { PageHeader } from '@/components/layout/page-header'
import { OrganizationTable } from '@/components/organizations/organization-table'
import { Button } from '@/components/ui/button'
import { APPROVAL_LABELS, RELATIONSHIP_LABELS, type ApprovalState, type RelationshipType } from '@/lib/types'
import { cn } from '@/lib/utils'

export const metadata = { title: 'External organizations' }

const RELATIONSHIP_FILTERS: (RelationshipType | 'all')[] = ['all', 'unknown', 'partner', 'client', 'vendor', 'contractor', 'temporary', 'former', 'blocked']
const APPROVAL_FILTERS: ApprovalState[] = ['unreviewed', 'approved', 'restricted', 'blocked']

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ relationship?: string; approval?: string }> }) {
  const { relationship = 'all', approval } = await searchParams
  const { session, tenant } = await requireOnboarded()
  const all = await listOrganizations(tenant.id)
  const filtered = all.filter((o) => (relationship === 'all' || o.relationship_type === relationship) && (!approval || o.approval_state === approval))
  const relCounts = all.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.relationship_type]: (acc[o.relationship_type] ?? 0) + 1 }), {})
  const apprCounts = all.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.approval_state]: (acc[o.approval_state] ?? 0) + 1 }), {})
  const unreviewedIdentities = all.filter((o) => o.approval_state === 'unreviewed').reduce((s, o) => s + o.identity_count, 0)
  const canEdit = can(session.role, 'domain.classify')

  const href = (next: { relationship?: string; approval?: string }) => {
    const p = new URLSearchParams()
    const rel = next.relationship ?? relationship
    const ap = 'approval' in next ? next.approval : approval
    if (rel && rel !== 'all') p.set('relationship', rel)
    if (ap) p.set('approval', ap)
    const qs = p.toString()
    return qs ? `/organizations?${qs}` : '/organizations'
  }

  return (
    <>
      <PageHeader
        title="External organizations"
        description={`${all.length} organizations hold external access. ${apprCounts.unreviewed ?? 0} are unreviewed, covering ${unreviewedIdentities} identities — approve, restrict, or block them to set governance intent.`}
        actions={
          can(session.role, 'export') ? (
            <Button variant="outline" nativeButton={false} render={<a href="/api/export?type=organizations" />}>
              <Download data-icon="inline-start" /> Export CSV
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by relationship">
          {RELATIONSHIP_FILTERS.map((f) => (
            <Link
              key={f}
              href={href({ relationship: f })}
              role="tab"
              aria-selected={relationship === f}
              className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent', relationship === f ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
            >
              {f === 'all' ? 'All relationships' : RELATIONSHIP_LABELS[f]}
              <span className="tnum ml-1.5 font-mono">{f === 'all' ? all.length : relCounts[f] ?? 0}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by approval state">
          <Link
            href={href({ approval: undefined })}
            role="tab"
            aria-selected={!approval}
            className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent', !approval ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
          >
            Any approval state
          </Link>
          {APPROVAL_FILTERS.map((a) => (
            <Link
              key={a}
              href={href({ approval: a })}
              role="tab"
              aria-selected={approval === a}
              className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent', approval === a ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}
            >
              {APPROVAL_LABELS[a]}
              <span className="tnum ml-1.5 font-mono">{apprCounts[a] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>

      <OrganizationTable organizations={filtered} canEdit={canEdit} />
    </>
  )
}
