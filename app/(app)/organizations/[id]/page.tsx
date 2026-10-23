import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getOrganizationDetail, listOrganizationOptions } from '@/lib/data/organizations'
import { PageHeader } from '@/components/layout/page-header'
import { ApprovalBadge, IdentityTypeBadge, RelationshipBadge } from '@/components/organizations/org-badges'
import { EditOrganizationDialog } from '@/components/organizations/edit-organization-dialog'
import { AssignDomainDialog } from '@/components/organizations/assign-domain-dialog'
import { DomainClassBadge } from '@/components/domains/domain-class-badge'
import { GuestTable } from '@/components/guests/guest-table'
import { StatCard } from '@/components/dashboard/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, relativeDays } from '@/lib/format'
import { RESOURCE_TYPE_LABELS, type ExternalIdentityType, type ResourceType } from '@/lib/types'

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, tenant } = await requireOnboarded()
  const [data, options] = await Promise.all([getOrganizationDetail(tenant.id, id), listOrganizationOptions(tenant.id)])
  if (!data) notFound()
  const { organization, domains, identities, resources, typeBreakdown } = data
  const cutoff = Date.now() - 90 * 86_400_000
  const inactive = identities.filter((g) => !g.last_sign_in_at || new Date(g.last_sign_in_at).getTime() < cutoff).length
  const critical = identities.filter((g) => g.risk_level === 'critical').length
  const sensitiveResources = resources.filter((r) => r.is_sensitive)
  const canEdit = can(session.role, 'domain.classify')
  const otherOrganizations = options.filter((o) => o.id !== organization.id)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/organizations" />}>
          <ArrowLeft data-icon="inline-start" /> Organizations
        </Button>
      </div>
      <PageHeader
        eyebrow="External organization"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {organization.name}
            <RelationshipBadge value={organization.relationship_type} className="text-sm" />
            <ApprovalBadge value={organization.approval_state} className="text-sm" />
          </span>
        }
        description={
          <>
            {organization.business_owner ? `Owned by ${organization.business_owner}${organization.business_owner_email ? ` (${organization.business_owner_email})` : ''}. ` : 'No business owner assigned. '}
            {organization.review_date ? `Review date ${formatDate(organization.review_date)}. ` : ''}
            First seen {formatDate(organization.first_seen_at)}, last seen {relativeDays(organization.last_seen_at)}.{organization.notes ? ` ${organization.notes}` : ''}
          </>
        }
        actions={canEdit ? <EditOrganizationDialog organization={organization} size="default" variant="default" /> : null}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="External identities" value={identities.length} />
        <StatCard label="Critical" value={critical} tone={critical ? 'critical' : 'default'} />
        <StatCard label="Inactive 90d+" value={inactive} />
        <StatCard label="Sensitive resources reached" value={sensitiveResources.length} tone={sensitiveResources.length ? 'warning' : 'default'} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Domains</CardTitle>
            <CardDescription>Sign-in domains attributed to this organization. Move a domain if it was grouped incorrectly.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Link href={`/domains/${encodeURIComponent(d.domain)}`} className="truncate font-mono text-sm hover:underline">
                    {d.domain}
                  </Link>
                  <DomainClassBadge classification={d.classification} />
                </div>
                {canEdit && <AssignDomainDialog domain={d} organizations={otherOrganizations} size="xs" variant="ghost" />}
              </div>
            ))}
            {domains.length === 0 && <p className="text-muted-foreground text-sm">No domains are attributed to this organization.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identity classification</CardTitle>
            <CardDescription>How AIGIS classifies the identities in this organization. Open any identity to see the evidence behind its type.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(typeBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div key={type} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
                  <IdentityTypeBadge value={type as ExternalIdentityType} />
                  <span className="tnum font-mono text-muted-foreground text-xs">{count}</span>
                </div>
              ))}
            {identities.length === 0 && <p className="text-muted-foreground text-sm">No active identities.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resources reachable from this organization</CardTitle>
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
          {resources.length === 0 && <p className="text-muted-foreground text-sm">No current resource access from this organization.</p>}
        </CardContent>
      </Card>

      <GuestTable guests={identities} canReview={can(session.role, 'review.create')} canExport={can(session.role, 'export')} exportHref={`/api/export?type=guests&organization=${organization.id}`} />
    </>
  )
}
