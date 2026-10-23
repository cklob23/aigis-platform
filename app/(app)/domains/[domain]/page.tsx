import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getDomainDetail } from '@/lib/data/domains'
import { PageHeader } from '@/components/layout/page-header'
import { DomainClassBadge } from '@/components/domains/domain-class-badge'
import { ClassifyDomainDialog } from '@/components/domains/classify-dialog'
import { AssignDomainDialog } from '@/components/organizations/assign-domain-dialog'
import { RelationshipBadge } from '@/components/organizations/org-badges'
import { listOrganizationOptions } from '@/lib/data/organizations'
import { GuestTable } from '@/components/guests/guest-table'
import { StatCard } from '@/components/dashboard/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/format'
import { RESOURCE_TYPE_LABELS, type ResourceType } from '@/lib/types'

export default async function DomainDetailPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain: raw } = await params
  const { session, tenant } = await requireOnboarded()
  const [data, orgOptions] = await Promise.all([getDomainDetail(tenant.id, decodeURIComponent(raw)), listOrganizationOptions(tenant.id)])
  if (!data) notFound()
  const { domain, guests, resources } = data
  const organization = domain.organization_id ? orgOptions.find((o) => o.id === domain.organization_id) ?? null : null
  const canEdit = can(session.role, 'domain.classify')
  const cutoff = Date.now() - 90 * 86_400_000
  const inactive = guests.filter((g) => !g.last_sign_in_at || new Date(g.last_sign_in_at).getTime() < cutoff).length
  const critical = guests.filter((g) => g.risk_level === 'critical').length
  const sensitiveResources = resources.filter((r) => r.is_sensitive)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/domains" />}>
          <ArrowLeft data-icon="inline-start" /> Domains
        </Button>
      </div>
      <PageHeader
        eyebrow={
          organization ? (
            <span className="flex items-center gap-2">
              <Link href={`/organizations/${organization.id}`} className="font-medium text-foreground hover:underline">
                {organization.name}
              </Link>
              <RelationshipBadge value={organization.relationship_type} />
            </span>
          ) : (
            'External domain · unassigned'
          )
        }
        title={
          <span className="flex flex-wrap items-center gap-3 font-mono">
            {domain.domain}
            <DomainClassBadge classification={domain.classification} className="font-sans text-sm" />
          </span>
        }
        description={
          <>
            {domain.business_owner ? `Owned by ${domain.business_owner}. ` : 'No business owner assigned. '}
            {domain.review_date ? `Review date ${formatDate(domain.review_date)}. ` : ''}
            First seen {formatDate(domain.first_seen_at)}.{domain.notes ? ` ${domain.notes}` : ''}
          </>
        }
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <AssignDomainDialog domain={domain} organizations={orgOptions.filter((o) => o.id !== domain.organization_id)} size="default" variant="outline" />
              <ClassifyDomainDialog domain={domain} size="default" variant="default" />
            </div>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="External identities" value={guests.length} />
        <StatCard label="Critical" value={critical} tone={critical ? 'critical' : 'default'} />
        <StatCard label="Inactive 90d+" value={inactive} />
        <StatCard label="Sensitive resources reached" value={sensitiveResources.length} tone={sensitiveResources.length ? 'warning' : 'default'} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Resources reachable from this domain</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {resources.map((r) => (
            <Link key={r.id} href={`/resources/${r.id}`} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors hover:bg-accent/50">
              <span>{r.display_name}</span>
              <span className="text-muted-foreground text-xs">{RESOURCE_TYPE_LABELS[r.resource_type as ResourceType]}</span>
              {r.is_sensitive && (
                <Badge variant="outline" className="border-warning/50 text-warning capitalize">
                  {r.sensitivity_category}
                </Badge>
              )}
              <span className="tnum font-mono text-muted-foreground text-xs">{r.count}</span>
            </Link>
          ))}
          {resources.length === 0 && <p className="text-muted-foreground text-sm">No current resource access from this domain.</p>}
        </CardContent>
      </Card>

      <GuestTable guests={guests} canReview={can(session.role, 'review.create')} canExport={can(session.role, 'export')} exportHref={`/api/export?type=guests&domain=${encodeURIComponent(domain.domain)}`} />
    </>
  )
}
