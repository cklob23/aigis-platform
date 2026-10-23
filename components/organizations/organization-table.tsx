'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STICKY_ROW, stickyCell, stickyCheckboxCell, stickyCheckboxHead, stickyHead } from '@/components/ui/table-sticky'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApprovalBadge, RelationshipBadge } from '@/components/organizations/org-badges'
import { EditOrganizationDialog } from '@/components/organizations/edit-organization-dialog'
import { BulkUpdateOrganizationsDialog } from '@/components/organizations/bulk-update-dialog'
import { relativeDays } from '@/lib/format'
import type { OrganizationSummary } from '@/lib/data/organizations'
import { cn } from '@/lib/utils'

export function OrganizationTable({ organizations, canEdit }: { organizations: OrganizationSummary[]; canEdit: boolean }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return organizations
    return organizations.filter((o) => o.name.toLowerCase().includes(q) || o.domains.some((d) => d.toLowerCase().includes(q)) || (o.business_owner ?? '').toLowerCase().includes(q))
  }, [organizations, query])

  const allVisibleSelected = visible.length > 0 && visible.every((o) => selected.has(o.id))
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visible.forEach((o) => next.delete(o.id))
      else visible.forEach((o) => next.add(o.id))
      return next
    })
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectedRows = organizations.filter((o) => selected.has(o.id))
  const selectedIdentities = selectedRows.reduce((s, o) => s + o.identity_count, 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search organization, domain, owner…" className="h-8 w-72 pl-8 text-sm" aria-label="Search organizations" />
        </div>
        {query && (
          <span className="text-muted-foreground text-xs">
            {visible.length} of {organizations.length}
          </span>
        )}
        {selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm">
              <span className="tnum font-medium">{selected.size}</span> selected · {selectedIdentities} identities
            </span>
            {canEdit && <BulkUpdateOrganizationsDialog organizationIds={selectedRows.map((o) => o.id)} names={selectedRows.map((o) => o.name)} onDone={() => setSelected(new Set())} />}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          canEdit && <span className="ml-auto text-muted-foreground text-sm">Select organizations to classify or assign an owner in bulk.</span>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {canEdit && (
                <TableHead className={stickyCheckboxHead()}>
                  <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all visible organizations" />
                </TableHead>
              )}
              <TableHead className={stickyHead(canEdit ? 'left-10' : 'left-0')}>Organization</TableHead>
              <TableHead>Relationship</TableHead>
              <TableHead className="hidden md:table-cell">Approval</TableHead>
              <TableHead className="text-right">Identities</TableHead>
              <TableHead className="hidden text-right md:table-cell">Active 90d</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Crit / High</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Sensitive</TableHead>
              <TableHead className="hidden xl:table-cell">Owner</TableHead>
              <TableHead className="hidden xl:table-cell">Last activity</TableHead>
              <TableHead className="w-36" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((o) => (
              <TableRow key={o.id} className={STICKY_ROW} data-state={selected.has(o.id) ? 'selected' : undefined}>
                {canEdit && (
                  <TableCell className={stickyCheckboxCell()}>
                    <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} aria-label={`Select ${o.name}`} />
                  </TableCell>
                )}
                <TableCell className={stickyCell(canEdit ? 'left-10' : 'left-0', 'max-w-64')}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link href={`/organizations/${o.id}`} className="truncate font-medium hover:underline" title={o.name}>
                      {o.name}
                    </Link>
                    <span className="truncate font-mono text-muted-foreground text-xs" title={o.domains.join(', ') || undefined}>
                      {o.domains.slice(0, 2).join(', ')}
                      {o.domains.length > 2 && ` +${o.domains.length - 2}`}
                      {o.domains.length === 0 && 'no domains'}
                    </span>
                  </div>
                  {o.review_date && new Date(o.review_date).getTime() < Date.now() && <span className="mt-1 block text-destructive text-xs">review expired {relativeDays(o.review_date)}</span>}
                </TableCell>
                <TableCell>
                  <RelationshipBadge value={o.relationship_type} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <ApprovalBadge value={o.approval_state} />
                </TableCell>
                <TableCell className="tnum text-right font-mono">{o.identity_count}</TableCell>
                <TableCell className="tnum hidden text-right font-mono text-muted-foreground md:table-cell">{o.active_count}</TableCell>
                <TableCell className="tnum hidden text-right font-mono lg:table-cell">
                  <span className={cn(o.critical_count && 'text-destructive')}>{o.critical_count}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className={cn(o.high_count && 'text-warning')}>{o.high_count}</span>
                </TableCell>
                <TableCell className="tnum hidden text-right font-mono lg:table-cell">{o.sensitive_count}</TableCell>
                <TableCell className="hidden max-w-40 truncate text-xs xl:table-cell" title={o.business_owner ?? undefined}>
                  {o.business_owner ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="hidden font-mono text-xs xl:table-cell">{relativeDays(o.last_activity)}</TableCell>
                <TableCell className="text-right">{canEdit && <EditOrganizationDialog organization={o} size="xs" variant="ghost" />}</TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={canEdit ? 11 : 10} className="h-24 text-center text-muted-foreground">
                  {query ? `No organizations match “${query}”.` : 'No organizations match these filters.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
