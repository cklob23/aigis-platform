'use client'

import { useCallback, useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { STICKY_ROW, stickyCell, stickyHead } from '@/components/ui/table-sticky'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TierBadge } from '@/components/privileged/tier-badge'
import { RiskBadge } from '@/components/risk/risk-badge'
import {
  combinedStateLabel,
  filterHolders,
  groupHoldersByIdentity,
  privilegedClassLabel,
  uniqueHolderCount,
  type HolderFilters,
  type PrivilegedAssignmentState,
  type PrivilegedHolder,
  type PrivilegedHolderGroup,
} from '@/lib/privileged/view'
import { relativeDays } from '@/lib/format'
import { DORMANT_ADMIN_DAYS, daysSince, privilegedReviewPastCadence } from '@/lib/risk/privileged'
import { cn } from '@/lib/utils'
import type { IdentityClass } from '@/lib/types'

const CLASS_OPTIONS: { value: 'all' | IdentityClass; label: string }[] = [
  { value: 'all', label: 'All classes' },
  { value: 'human_internal', label: 'Internal user' },
  { value: 'external', label: 'External user' },
  { value: 'non_human', label: 'Service principal' },
  { value: 'group', label: 'Group' },
]
const TIER_OPTIONS = [
  { value: 'all', label: 'All tiers' },
  { value: '0', label: 'Tier 0' },
  { value: '1', label: 'Tier 1' },
  { value: '2', label: 'Tier 2' },
]
const STATE_OPTIONS: { value: 'all' | PrivilegedAssignmentState; label: string }[] = [
  { value: 'all', label: 'Any state' },
  { value: 'permanent', label: 'Permanent' },
  { value: 'eligible', label: 'Eligible' },
  { value: 'time_bound', label: 'Time-bound' },
  { value: 'activated', label: 'Activated' },
]
const OWNER_OPTIONS = [
  { value: 'all', label: 'Any owner' },
  { value: 'unowned', label: 'Unowned' },
]

const REVIEW_CHIP =
  'rounded bg-[#FEF3C7] px-1 text-[10px] font-medium text-[#B45309] dark:bg-warning/15 dark:text-[#F5AE39]'
const STICKY_BELOW_1440 = 'min-[1440px]:static min-[1440px]:z-auto min-[1440px]:after:hidden'

export function HoldersTable({
  holders,
  pimAvailable,
  totalIdentities,
}: {
  holders: PrivilegedHolder[]
  pimAvailable: boolean
  totalIdentities: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      next.set('tab', 'holders')
      if (!value || value === 'all') next.delete(key)
      else next.set(key, value)
      startTransition(() => router.replace(`${pathname}?${next.toString()}`))
    },
    [params, pathname, router],
  )

  const filters: HolderFilters = {
    q: params.get('q') ?? undefined,
    class: (params.get('class') as HolderFilters['class']) ?? 'all',
    tier: (params.get('tier') as HolderFilters['tier']) ?? 'all',
    state: (params.get('state') as HolderFilters['state']) ?? 'all',
    owner: (params.get('owner') as HolderFilters['owner']) ?? 'all',
    dormant: params.get('dormant') === '1',
  }
  const rows = useMemo(() => filterHolders(holders, filters), [holders, filters])

  const select = (key: string, options: { value: string; label: string }[], widthClass = 'w-40') => (
    <Select
      items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
      value={params.get(key) ?? options[0].value}
      onValueChange={(v) => set(key, v as string)}
    >
      <SelectTrigger size="sm" className={widthClass} aria-label={options[0].label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            defaultValue={filters.q ?? ''}
            placeholder="Search names or roles"
            className="h-8 pl-7"
            onChange={(e) => set('q', e.target.value || null)}
            aria-label="Search role holders"
          />
        </div>
        {select('class', CLASS_OPTIONS, 'w-40')}
        {select('tier', TIER_OPTIONS, 'w-28')}
        {pimAvailable && select('state', STATE_OPTIONS, 'w-36')}
        {select('owner', OWNER_OPTIONS, 'w-32')}
        <Button
          type="button"
          size="sm"
          variant={filters.dormant ? 'secondary' : 'outline'}
          onClick={() => set('dormant', filters.dormant ? null : '1')}
        >
          Dormant only
        </Button>
        <span className="ml-auto text-muted-foreground text-xs">
          Showing {uniqueHolderCount(rows)} of {totalIdentities}
        </span>
      </div>
      <HoldersMarkup rows={rows} pimAvailable={pimAvailable} />
    </div>
  )
}

export function HoldersTableStatic({
  holders,
  pimAvailable,
  filters = {},
  totalIdentities,
}: {
  holders: PrivilegedHolder[]
  pimAvailable: boolean
  filters?: HolderFilters
  totalIdentities?: number
}) {
  const rows = filterHolders(holders, filters)
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs">
        Showing {uniqueHolderCount(rows)} of {totalIdentities ?? uniqueHolderCount(holders)}
      </span>
      <HoldersMarkup rows={rows} pimAvailable={pimAvailable} />
    </div>
  )
}

function HoldersMarkup({ rows, pimAvailable }: { rows: PrivilegedHolder[]; pimAvailable: boolean }) {
  const grouped = groupHoldersByIdentity(rows)
  return (
    <>
      <div className="relative hidden rounded-lg border sm:block">
        <div className="overflow-x-auto max-[1439px]:[mask-image:linear-gradient(to_right,black_calc(100%-3rem),transparent)]">
          <table className="w-full min-w-[72rem] caption-bottom text-sm min-[1440px]:min-w-0">
            <TableHeader>
              <TableRow className={cn('bg-muted/40 hover:bg-muted/40', STICKY_ROW)}>
                <TableHead className={stickyHead('left-0', cn('w-44 min-w-44 max-w-44', STICKY_BELOW_1440))}>Identity</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map((row) => (
                <HolderRow key={row.identityId} row={row} pimAvailable={pimAvailable} />
              ))}
              {grouped.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground text-sm">
                    No role holders match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        </div>
      </div>
      <div className="flex flex-col overflow-hidden rounded-lg border sm:hidden">
        {grouped.map((row) => (
          <HolderStackedCard key={row.identityId} row={row} pimAvailable={pimAvailable} />
        ))}
        {grouped.length === 0 && <p className="px-3 py-8 text-center text-muted-foreground text-sm">No role holders match these filters.</p>}
      </div>
    </>
  )
}

function RoleNames({ names }: { names: string[] }) {
  const [first, ...rest] = names
  if (!first) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex max-w-[10.5rem] items-baseline gap-1">
      <span className="truncate">{first}</span>
      {rest.length > 0 ? <span className="shrink-0 text-muted-foreground">+{rest.length}</span> : null}
    </span>
  )
}

function ReviewStatus({ row }: { row: PrivilegedHolder }) {
  const neverReviewed = !row.lastReviewedAt
  const overdue = privilegedReviewPastCadence(row.lastReviewedAt)
  if (neverReviewed) return <span className={REVIEW_CHIP}>Never reviewed</span>
  if (overdue) return <span className={REVIEW_CHIP}>Review overdue</span>
  return null
}

function MfaCell({ label }: { label: string }) {
  if (label === 'None') {
    return (
      <span className="inline-flex h-5 items-center rounded-md bg-destructive/10 px-1.5 text-destructive text-xs font-medium">
        None
      </span>
    )
  }
  return <span className="text-xs font-normal">{label}</span>
}

function HolderRow({ row, pimAvailable }: { row: PrivilegedHolderGroup; pimAvailable: boolean }) {
  const idle = daysSince(row.lastActivityAt)
  const dormant = row.lastActivityAt == null || (idle !== null && idle >= DORMANT_ADMIN_DAYS)
  return (
    <TableRow className={STICKY_ROW}>
      <TableCell className={stickyCell('left-0', cn('w-44 min-w-44 max-w-44', STICKY_BELOW_1440))}>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{row.displayName ?? row.identifier}</span>
          <span className="truncate font-mono text-muted-foreground text-xs">{row.identifier}</span>
        </div>
      </TableCell>
      <TableCell className="text-xs">{privilegedClassLabel(row.identityClass, row.dedicatedAdmin)}</TableCell>
      <TableCell>
        <TierBadge tier={row.privilegeTier} />
      </TableCell>
      <TableCell>
        <RoleNames names={row.roleNames} />
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="h-5 font-normal">
          {pimAvailable ? combinedStateLabel(row.assignmentStates, true) : 'Active'}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col items-start gap-0.5">
          <span className={cn('tnum whitespace-nowrap text-xs', dormant && 'text-destructive')}>{relativeDays(row.lastActivityAt)}</span>
          <ReviewStatus row={row} />
        </div>
      </TableCell>
      <TableCell>
        <MfaCell label={row.mfaLabel} />
      </TableCell>
      <TableCell className="max-w-[6.5rem] truncate text-xs font-normal">{row.ownerDisplayName ?? '—'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 whitespace-nowrap">
          <RiskBadge level={row.riskLevel} />
          <span className="tnum text-xs">{row.riskScore}</span>
        </div>
      </TableCell>
    </TableRow>
  )
}

function HolderStackedCard({ row, pimAvailable }: { row: PrivilegedHolderGroup; pimAvailable: boolean }) {
  const idle = daysSince(row.lastActivityAt)
  const dormant = row.lastActivityAt == null || (idle !== null && idle >= DORMANT_ADMIN_DAYS)
  return (
    <div className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.displayName ?? row.identifier}</span>
        <span className="truncate font-mono text-muted-foreground text-xs">{row.identifier}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs">{privilegedClassLabel(row.identityClass, row.dedicatedAdmin)}</span>
        <TierBadge tier={row.privilegeTier} />
        <RoleNames names={row.roleNames} />
        <Badge variant="outline" className="h-5 font-normal">
          {pimAvailable ? combinedStateLabel(row.assignmentStates, true) : 'Active'}
        </Badge>
        <div className="flex items-center gap-1">
          <RiskBadge level={row.riskLevel} />
          <span className="tnum text-xs">{row.riskScore}</span>
        </div>
        <ReviewStatus row={row} />
        <span className={cn('tnum text-xs', dormant && 'text-destructive')}>{relativeDays(row.lastActivityAt)}</span>
      </div>
    </div>
  )
}
