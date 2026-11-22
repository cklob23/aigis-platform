'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardPlus, Download, UserX } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STICKY_ROW, stickyCell, stickyCheckboxCell, stickyCheckboxHead, stickyHead } from '@/components/ui/table-sticky'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { RiskBadge, RiskScoreBar } from '@/components/risk/risk-badge'
import { NewReviewWizard } from '@/components/reviews/new-review-wizard'
import { relativeDays, formatDate } from '@/lib/format'
import type { Guest } from '@/lib/types'
import { RECOMMENDATION_LABELS as ACTION_LABEL } from '@/lib/risk/recommendation'
import { cn } from '@/lib/utils'
import { TierBadge } from '@/components/privileged/tier-badge'

/** Fixed identity width so the sticky column cannot grow over Domain. Narrower on small screens. */
const IDENTITY_COL =
  'w-40 min-w-40 max-w-40 overflow-hidden pr-3 sm:w-52 sm:min-w-52 sm:max-w-52 lg:w-56 lg:min-w-56 lg:max-w-56'

export function GuestTable({
  guests,
  canReview,
  canExport,
  exportHref,
  scopeCounts,
  defaultReviewerEmails = [],
  emptyMessage = 'No identities match these filters.',
  privilegeTiers = {},
}: {
  guests: Guest[]
  canReview: boolean
  canExport: boolean
  exportHref: string
  /** Tenant-wide counts for the broad scope options. Omit on pages already scoped to one domain, organization or resource. */
  scopeCounts?: { all_external: number; high_critical: number }
  defaultReviewerEmails?: string[]
  emptyMessage?: string
  privilegeTiers?: Record<string, 0 | 1 | 2>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reviewOpen, setReviewOpen] = useState(false)

  const allSelected = guests.length > 0 && guests.every((g) => selected.has(g.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(guests.map((g) => g.id)))
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {canReview && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex" />}>
              <Button size="sm" onClick={() => setReviewOpen(true)} disabled={selected.size === 0} aria-describedby={selected.size === 0 ? 'review-selection-hint' : undefined}>
                <ClipboardPlus data-icon="inline-start" /> Create access review{selected.size > 0 && ` (${selected.size})`}
              </Button>
            </TooltipTrigger>
            {selected.size === 0 && <TooltipContent>Tick one or more identities to enable</TooltipContent>}
          </Tooltip>
        )}
        {selected.size > 0 ? (
          <>
            <span className="text-sm">
              <span className="tnum font-medium">{selected.size}</span> selected
            </span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        ) : (
          <span id="review-selection-hint" className="text-muted-foreground text-sm">
            {canReview ? 'Selection required: tick identities in the table to start an access review.' : 'Select identities to export or inspect.'}
          </span>
        )}
        {canExport && (
          <Button size="sm" variant="outline" className="ml-auto" nativeButton={false} render={<a href={exportHref} />}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={stickyCheckboxHead()}>
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all identities on this page" />
              </TableHead>
              <TableHead className={stickyHead('left-10', IDENTITY_COL)}>Identity</TableHead>
              <TableHead className="min-w-0 pl-3">Domain</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="hidden lg:table-cell">Top factors</TableHead>
              <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
              <TableHead className="hidden xl:table-cell">Sponsor</TableHead>
              <TableHead className="text-right">Recommendation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.map((g) => (
              <TableRow key={g.id} className={STICKY_ROW} data-state={selected.has(g.id) ? 'selected' : undefined}>
                <TableCell className={stickyCheckboxCell()}>
                  <Checkbox checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} aria-label={`Select ${g.display_name ?? g.email}`} />
                </TableCell>
                <TableCell className={stickyCell('left-10', IDENTITY_COL)}>
                  <Link href={`/guests/${g.id}`} className="flex min-w-0 flex-col outline-none hover:underline focus-visible:underline">
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      <span className="min-w-0 truncate" title={g.display_name ?? g.email ?? undefined}>
                        {g.display_name ?? g.email}
                      </span>
                      {!g.account_enabled && (
                        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] text-muted-foreground">
                          disabled
                        </Badge>
                      )}
                      {g.invitation_status === 'PendingAcceptance' && (
                        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px] text-warning">
                          pending
                        </Badge>
                      )}
                      <TierBadge tier={privilegeTiers[g.identity_id] ?? null} />
                    </span>
                    <span className="block min-w-0 truncate font-mono text-muted-foreground text-xs" title={g.email ?? undefined}>
                      {g.email}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="min-w-0 max-w-48 truncate pl-3 font-mono text-xs" title={g.domain ?? undefined}>
                  {g.domain}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RiskBadge level={g.risk_level} />
                    <RiskScoreBar score={g.risk_score} level={g.risk_level} className="hidden sm:flex" />
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-64 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {[...g.risk_factors]
                      .sort((a, b) => b.points - a.points)
                      .slice(0, 2)
                      .map((f) => (
                        <Tooltip key={f.key}>
                          <TooltipTrigger render={<span className="truncate rounded bg-muted px-1.5 py-0.5 text-xs" />}>{f.label}</TooltipTrigger>
                          <TooltipContent>
                            +{f.points} · {f.detail ?? f.label}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    {g.risk_factors.length > 2 && <span className="text-muted-foreground text-xs">+{g.risk_factors.length - 2}</span>}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <Tooltip>
                    <TooltipTrigger render={<span className={cn('font-mono text-xs', !g.last_sign_in_at && 'text-destructive')} />}>{relativeDays(g.last_sign_in_at)}</TooltipTrigger>
                    <TooltipContent>{formatDate(g.last_sign_in_at, true)}</TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="hidden max-w-40 xl:table-cell">
                  {g.sponsor_display_name ? (
                    <span className={cn('block truncate text-xs', g.sponsor_enabled === false && 'text-warning line-through')} title={g.sponsor_display_name}>
                      {g.sponsor_display_name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">None</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn('text-xs', g.recommended_action === 'remove' && 'text-destructive', g.recommended_action === 'disable' && 'text-warning')}>{ACTION_LABEL[g.recommended_action]}</span>
                </TableCell>
              </TableRow>
            ))}
            {guests.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  <UserX className="mx-auto mb-2 size-5" />
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {canReview && (
        <NewReviewWizard
          key={reviewOpen ? 'open' : 'closed'}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          scopeCounts={scopeCounts}
          selectedGuestIds={Array.from(selected)}
          defaultReviewerEmails={defaultReviewerEmails}
          trigger={<span className="hidden" />}
        />
      )}
    </div>
  )
}
