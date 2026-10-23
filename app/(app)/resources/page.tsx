import Link from 'next/link'
import { Download, ExternalLink } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getResourceCounts, listResources } from '@/lib/data/resources'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STICKY_ROW, stickyCell, stickyHead } from '@/components/ui/table-sticky'
import { RESOURCE_TYPE_LABELS, type ResourceType } from '@/lib/types'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Resources' }

const TYPES: (ResourceType | 'all')[] = ['all', 'team', 'm365_group', 'sharepoint_site', 'enterprise_app', 'security_group']

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ type?: string; sensitive?: string; q?: string }> }) {
  const sp = await searchParams
  const { session, tenant } = await requireOnboarded()
  const type = (sp.type ?? 'all') as ResourceType | 'all'
  const sensitive = sp.sensitive === '1'
  const [resources, counts] = await Promise.all([listResources(tenant.id, { type, sensitive, q: sp.q }), getResourceCounts(tenant.id)])
  const totalWithGuests = Object.values(counts).reduce((s, c) => s + c.withGuests, 0)
  const sensitiveWithGuests = Object.values(counts).reduce((s, c) => s + c.sensitiveWithGuests, 0)
  const href = (t: ResourceType | 'all', s: boolean) => {
    const p = new URLSearchParams()
    if (t !== 'all') p.set('type', t)
    if (s) p.set('sensitive', '1')
    if (sp.q) p.set('q', sp.q)
    const qs = p.toString()
    return qs ? `/resources?${qs}` : '/resources'
  }

  return (
    <>
      <PageHeader
        title="Resources with external access"
        description={`${totalWithGuests} Teams, groups, sites, and apps currently include guests — ${sensitiveWithGuests} of them classified sensitive.`}
        actions={
          can(session.role, 'export') ? (
            <Button variant="outline" nativeButton={false} render={<a href="/api/export?type=resources" />}>
              <Download data-icon="inline-start" /> Export CSV
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {TYPES.map((t) => (
          <Link key={t} href={href(t, sensitive)} className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent', type === t ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
            {t === 'all' ? 'All types' : RESOURCE_TYPE_LABELS[t]}
            <span className="tnum ml-1.5 font-mono">{t === 'all' ? totalWithGuests : counts[t]?.withGuests ?? 0}</span>
          </Link>
        ))}
        <Link href={href(type, !sensitive)} className={cn('ml-auto rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent', sensitive ? 'border-warning bg-warning/10 text-warning' : 'text-muted-foreground')}>
          Sensitive only
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={stickyHead()}>Resource</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sensitivity</TableHead>
              <TableHead className="text-right">External identities</TableHead>
              <TableHead className="hidden text-right md:table-cell">Internal</TableHead>
              <TableHead className="hidden md:table-cell">Guest share</TableHead>
              <TableHead className="hidden lg:table-cell">Visibility</TableHead>
              <TableHead className="hidden xl:table-cell">Owners</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {resources.map((r) => {
              const total = r.internal_member_count + r.external_member_count
              const share = total ? Math.round((r.external_member_count / total) * 100) : 0
              return (
                <TableRow key={r.id} className={STICKY_ROW}>
                  <TableCell className={stickyCell('left-0', 'max-w-72')}>
                    <Link href={`/resources/${r.id}`} className="block truncate font-medium hover:underline" title={r.display_name}>
                      {r.display_name}
                    </Link>
                    {r.description && (
                      <span className="block truncate text-muted-foreground text-xs" title={r.description}>
                        {r.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">{RESOURCE_TYPE_LABELS[r.resource_type]}</TableCell>
                  <TableCell>
                    {r.is_sensitive ? (
                      <Badge variant="outline" className="border-warning/50 text-warning capitalize">
                        {r.sensitivity_category}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Standard</span>
                    )}
                  </TableCell>
                  <TableCell className="tnum text-right font-mono">{r.external_member_count}</TableCell>
                  <TableCell className="tnum hidden text-right font-mono text-muted-foreground md:table-cell">{r.internal_member_count}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className={cn('h-full rounded-full', share > 50 ? 'bg-destructive' : share > 25 ? 'bg-warning' : 'bg-primary')} style={{ width: `${share}%` }} />
                      </div>
                      <span className="tnum font-mono text-xs">{share}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">{r.visibility ?? '—'}</TableCell>
                  <TableCell className="hidden max-w-48 truncate text-xs xl:table-cell" title={r.owners.map((o) => o.displayName).join(', ') || undefined}>
                    {r.owners.map((o) => o.displayName).join(', ') || '—'}
                  </TableCell>
                  <TableCell>
                    {r.web_url && (
                      <a href={r.web_url} target="_blank" rel="noreferrer" aria-label="Open" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {resources.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  No resources match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
