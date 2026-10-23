import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, Link2 } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getResourceDetail } from '@/lib/data/resources'
import { PageHeader } from '@/components/layout/page-header'
import { GuestTable } from '@/components/guests/guest-table'
import { SensitivityEditor } from '@/components/resources/sensitivity-editor'
import { StatCard } from '@/components/dashboard/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RESOURCE_TYPE_LABELS } from '@/lib/types'

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, tenant } = await requireOnboarded()
  const data = await getResourceDetail(tenant.id, id)
  if (!data) notFound()
  const { resource: r, memberships, linked, children } = data
  const guests = memberships.map((m) => m.guest)
  const owners = memberships.filter((m) => m.membership_type === 'owner').length
  const critical = guests.filter((g) => g.risk_level === 'critical').length
  const domains = new Set(guests.map((g) => g.domain)).size

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/resources" />}>
          <ArrowLeft data-icon="inline-start" /> Resources
        </Button>
      </div>
      <PageHeader
        eyebrow={RESOURCE_TYPE_LABELS[r.resource_type]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.display_name}
            {r.is_sensitive && (
              <Badge variant="outline" className="border-warning/50 text-sm text-warning capitalize">
                {r.sensitivity_category}
              </Badge>
            )}
            {r.visibility && <Badge variant="outline">{r.visibility}</Badge>}
          </span>
        }
        description={
          <>
            {r.description ? `${r.description} · ` : ''}
            Owners: {r.owners.map((o) => o.displayName).join(', ') || 'none recorded'}.
            {linked && (
              <>
                {' '}
                Linked to{' '}
                <Link href={`/resources/${linked.id}`} className="underline underline-offset-4">
                  {linked.display_name}
                </Link>
                .
              </>
            )}
          </>
        }
        actions={
          r.web_url ? (
            <Button variant="outline" nativeButton={false} render={<a href={r.web_url} target="_blank" rel="noreferrer" />}>
              <ExternalLink data-icon="inline-start" /> Open in Microsoft 365
            </Button>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Guest members" value={memberships.length} hint={`${owners} with owner rights`} tone={owners ? 'warning' : 'default'} />
        <StatCard label="Internal members" value={r.internal_member_count} />
        <StatCard label="Critical guests" value={critical} tone={critical ? 'critical' : 'default'} />
        <StatCard label="External domains" value={domains} />
      </section>

      {can(session.role, 'policy.manage') && <SensitivityEditor resourceId={r.id} isSensitive={r.is_sensitive} category={r.sensitivity_category} />}

      {children.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link2 className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Connected:</span>
          {children.map((c) => (
            <Link key={c.id} href={`/resources/${c.id}`} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">
              {c.display_name} · {RESOURCE_TYPE_LABELS[c.resource_type as keyof typeof RESOURCE_TYPE_LABELS]}
            </Link>
          ))}
        </div>
      )}

      <GuestTable guests={guests} canReview={can(session.role, 'review.create')} canExport={false} exportHref="" />
    </>
  )
}
