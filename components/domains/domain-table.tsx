'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STICKY_ROW, stickyCell, stickyCheckboxCell, stickyCheckboxHead, stickyHead } from '@/components/ui/table-sticky'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DomainClassBadge } from '@/components/domains/domain-class-badge'
import { ClassifyDomainDialog } from '@/components/domains/classify-dialog'
import { BulkClassifyDialog } from '@/components/domains/bulk-classify-dialog'
import { relativeDays } from '@/lib/format'
import type { DomainSummary } from '@/lib/data/domains'
import { cn } from '@/lib/utils'

export function DomainTable({ domains, orgNames, canClassify }: { domains: DomainSummary[]; orgNames: Record<string, string>; canClassify: boolean }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return domains
    return domains.filter((d) => d.domain.toLowerCase().includes(q) || (d.business_owner ?? '').toLowerCase().includes(q) || (d.organization_id ? orgNames[d.organization_id] ?? '' : '').toLowerCase().includes(q))
  }, [domains, orgNames, query])

  const allVisibleSelected = visible.length > 0 && visible.every((d) => selected.has(d.id))
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visible.forEach((d) => next.delete(d.id))
      else visible.forEach((d) => next.add(d.id))
      return next
    })
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectedRows = domains.filter((d) => selected.has(d.id))
  const selectedIdentities = selectedRows.reduce((s, d) => s + d.guest_count, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search domain, owner, organization…" className="h-8 w-72 pl-8 text-sm" aria-label="Search domains" />
        </div>
        {query && (
          <span className="text-muted-foreground text-xs">
            {visible.length} of {domains.length}
          </span>
        )}
        {selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm">
              <span className="tnum font-medium">{selected.size}</span> selected · {selectedIdentities} identities
            </span>
            {canClassify && <BulkClassifyDialog domainIds={selectedRows.map((d) => d.id)} domainNames={selectedRows.map((d) => d.domain)} onDone={() => setSelected(new Set())} />}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          canClassify && <span className="ml-auto text-muted-foreground text-sm">Select domains to classify or assign an owner in bulk.</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {canClassify && (
                <TableHead className={stickyCheckboxHead()}>
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all visible domains" />
                </TableHead>
              )}
              <TableHead className={stickyHead(canClassify ? 'left-10' : 'left-0')}>Domain</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead className="hidden lg:table-cell">Organization</TableHead>
              <TableHead className="text-right">Identities</TableHead>
              <TableHead className="hidden text-right md:table-cell">Active 90d</TableHead>
              <TableHead className="hidden text-right md:table-cell">Crit / High</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Sensitive access</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Avg risk</TableHead>
              <TableHead className="hidden xl:table-cell">Owner</TableHead>
              <TableHead className="hidden xl:table-cell">Last activity</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((d) => (
              <TableRow key={d.id} className={STICKY_ROW} data-state={selected.has(d.id) ? 'selected' : undefined}>
                {canClassify && (
                  <TableCell className={stickyCheckboxCell()}>
                    <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggle(d.id)} aria-label={`Select ${d.domain}`} />
                  </TableCell>
                )}
                <TableCell className={stickyCell(canClassify ? 'left-10' : 'left-0', 'max-w-64')}>
                  <div className="flex min-w-0 items-center gap-2">
                    <Link href={`/domains/${encodeURIComponent(d.domain)}`} className="truncate font-mono text-sm hover:underline" title={d.domain}>
                      {d.domain}
                    </Link>
                    {d.review_date && new Date(d.review_date).getTime() < Date.now() && <span className="shrink-0 text-destructive text-xs">expired {relativeDays(d.review_date)}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <DomainClassBadge classification={d.classification} />
                </TableCell>
                <TableCell className="hidden max-w-48 text-xs lg:table-cell">
                  {d.organization_id ? (
                    <Link href={`/organizations/${d.organization_id}`} className="block truncate hover:underline" title={orgNames[d.organization_id] ?? 'Organization'}>
                      {orgNames[d.organization_id] ?? 'Organization'}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="tnum text-right font-mono">{d.guest_count}</TableCell>
                <TableCell className="tnum hidden text-right font-mono text-muted-foreground md:table-cell">{d.active_count}</TableCell>
                <TableCell className="tnum hidden text-right font-mono md:table-cell">
                  <span className={cn(d.critical_count && 'text-destructive')}>{d.critical_count}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={cn(d.high_count && 'text-warning')}>{d.high_count}</span>
                </TableCell>
                <TableCell className="tnum hidden text-right font-mono lg:table-cell">{d.sensitive_count}</TableCell>
                <TableCell className="tnum hidden text-right font-mono lg:table-cell">{d.avg_risk}</TableCell>
                <TableCell className="hidden max-w-40 truncate text-xs xl:table-cell" title={d.business_owner ?? undefined}>
                  {d.business_owner ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden font-mono text-xs xl:table-cell">{relativeDays(d.last_activity)}</TableCell>
                <TableCell className="text-right">{canClassify && <ClassifyDomainDialog domain={d} size="xs" variant="ghost" />}</TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={canClassify ? 12 : 11} className="h-24 text-center text-muted-foreground">
                  {query ? `No domains match “${query}”.` : 'No domains in this category.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
