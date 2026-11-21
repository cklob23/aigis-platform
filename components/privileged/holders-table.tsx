'use client'

import { useCallback, useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TierBadge } from '@/components/privileged/tier-badge'
import { RiskBadge } from '@/components/risk/risk-badge'
import {
  combinedStateLabel,
  filterHolders,
  privilegedClassLabel,
  uniqueHolderCount,
  type HolderFilters,
  type PrivilegedAssignmentState,
  type PrivilegedHolder,
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
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border sm:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Identity</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Highest tier</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Assignment</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
              <TableHead className="hidden lg:table-cell">MFA method</TableHead>
              <TableHead className="hidden xl:table-cell">Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <HolderRow key={`${row.identityId}:${row.roleId}`} row={row} pimAvailable={pimAvailable} />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground text-sm">
                  No role holders match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col overflow-hidden rounded-lg border sm:hidden">
        {rows.map((row) => (
          <HolderStackedCard key={`${row.identityId}:${row.roleId}`} row={row} pimAvailable={pimAvailable} />
        ))}
        {rows.length === 0 && <p className="px-3 py-8 text-center text-muted-foreground text-sm">No role holders match these filters.</p>}
      </div>
    </>
  )
}

function ReviewChips({ row }: { row: PrivilegedHolder }) {
  const neverReviewed = !row.lastReviewedAt
  const overdue = privilegedReviewPastCadence(row.lastReviewedAt)
  return (
    <div className="flex flex-wrap items-center gap-1">
      <RiskBadge level={row.riskLevel} />
      <span className="tnum text-xs">{row.riskScore}</span>
      {neverReviewed && (
        <span className="rounded bg-[#FEF3C7] px-1 text-[10px] font-medium text-[#B45309]">Never reviewed</span>
      )}
      {overdue && !neverReviewed && (
        <span className="rounded bg-[#FEF3C7] px-1 text-[10px] font-medium text-[#B45309]">Review overdue</span>
      )}
    </div>
  )
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

function HolderRow({ row, pimAvailable }: { row: PrivilegedHolder; pimAvailable: boolean }) {
  const idle = daysSince(row.lastActivityAt)
  const dormant = row.lastActivityAt == null || (idle !== null && idle >= DORMANT_ADMIN_DAYS)
  return (
    <TableRow>
      <TableCell>
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
        <span className="text-sm">{row.roleName}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="h-5 font-normal">
          {pimAvailable ? combinedStateLabel(row.assignmentStates, true) : 'Active'}
        </Badge>
      </TableCell>
      <TableCell>
        <ReviewChips row={row} />
      </TableCell>
      <TableCell className={cn('hidden tnum text-xs md:table-cell', dormant && 'text-destructive')}>
        {relativeDays(row.lastActivityAt)}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <MfaCell label={row.mfaLabel} />
      </TableCell>
      <TableCell className="hidden text-xs font-normal xl:table-cell">{row.ownerDisplayName ?? '—'}</TableCell>
    </TableRow>
  )
}

function HolderStackedCard({ row, pimAvailable }: { row: PrivilegedHolder; pimAvailable: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-b px-3 py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{row.displayName ?? row.identifier}</span>
        <span className="truncate font-mono text-muted-foreground text-xs">{row.identifier}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={row.privilegeTier} />
        <span className="text-sm">{row.roleName}</span>
        <Badge variant="outline" className="h-5 font-normal">
          {pimAvailable ? combinedStateLabel(row.assignmentStates, true) : 'Active'}
        </Badge>
        <ReviewChips row={row} />
      </div>
    </div>
  )
}
