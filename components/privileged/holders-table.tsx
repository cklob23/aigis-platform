'use client'

import { useCallback, useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { TierBadge } from '@/components/privileged/tier-badge'
import {
  ASSIGNMENT_STATE_LABEL,
  IDENTITY_CLASS_LABEL,
  filterHolders,
  type HolderFilters,
  type PrivilegedAssignmentState,
  type PrivilegedHolder,
} from '@/lib/privileged/view'
import { formatDate, relativeDays } from '@/lib/format'
import type { IdentityClass } from '@/lib/types'

const CLASS_OPTIONS: { value: 'all' | IdentityClass; label: string }[] = [
  { value: 'all', label: 'All classes' },
  { value: 'human_internal', label: 'Internal' },
  { value: 'external', label: 'External' },
  { value: 'non_human', label: 'Non-human' },
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
const REVIEW_OPTIONS = [
  { value: 'all', label: 'Any review' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'never', label: 'Never reviewed' },
]

export function HoldersTable({
  holders,
  pimAvailable,
}: {
  holders: PrivilegedHolder[]
  pimAvailable: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
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
    review: (params.get('review') as HolderFilters['review']) ?? 'all',
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
        {select('class', CLASS_OPTIONS, 'w-36')}
        {select('tier', TIER_OPTIONS, 'w-28')}
        {pimAvailable && select('state', STATE_OPTIONS, 'w-36')}
        {select('review', REVIEW_OPTIONS, 'w-36')}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Identity</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>{pimAvailable ? 'State' : 'State'}</TableHead>
              <TableHead className="hidden md:table-cell">Last activity</TableHead>
              <TableHead className="hidden lg:table-cell">Last reviewed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.identityId}>
                <TableCell>
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{row.displayName ?? row.email}</span>
                      {row.identityClass === 'external' && <TierBadge tier={row.privilegeTier} />}
                    </span>
                    <span className="truncate font-mono text-muted-foreground text-xs">{row.email}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs">{IDENTITY_CLASS_LABEL[row.identityClass]}</TableCell>
                <TableCell>
                  <TierBadge tier={row.privilegeTier} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <Badge key={role.assignmentId} variant="outline" className="h-5 max-w-48 truncate font-normal">
                        {role.roleName}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {pimAvailable ? (
                      row.assignmentStates.map((state) => (
                        <Badge key={state} variant="outline" className="h-5 font-normal">
                          {ASSIGNMENT_STATE_LABEL[state]}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline" className="h-5 font-normal">
                        Active · PIM n/a
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden font-mono text-xs md:table-cell">{relativeDays(row.lastActivityAt)}</TableCell>
                <TableCell className="hidden font-mono text-xs lg:table-cell">{row.lastReviewedAt ? formatDate(row.lastReviewedAt) : 'Never'}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground text-sm">
                  No role holders match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export function HoldersTableStatic({
  holders,
  pimAvailable,
  filters = {},
}: {
  holders: PrivilegedHolder[]
  pimAvailable: boolean
  filters?: HolderFilters
}) {
  const rows = filterHolders(holders, filters)
  return (
    <HoldersMarkup rows={rows} pimAvailable={pimAvailable} />
  )
}

function HoldersMarkup({ rows, pimAvailable }: { rows: PrivilegedHolder[]; pimAvailable: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>Identity</TableHead>
            <TableHead>Class</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>State</TableHead>
            <TableHead className="hidden md:table-cell">Last activity</TableHead>
            <TableHead className="hidden lg:table-cell">Last reviewed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.identityId}>
              <TableCell>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="truncate">{row.displayName ?? row.email}</span>
                    {row.identityClass === 'external' && <TierBadge tier={row.privilegeTier} />}
                  </span>
                  <span className="truncate font-mono text-muted-foreground text-xs">{row.email}</span>
                </div>
              </TableCell>
              <TableCell className="text-xs">{IDENTITY_CLASS_LABEL[row.identityClass]}</TableCell>
              <TableCell>
                <TierBadge tier={row.privilegeTier} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {row.roles.map((role) => (
                    <Badge key={role.assignmentId} variant="outline" className="h-5 max-w-48 truncate font-normal">
                      {role.roleName}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {pimAvailable ? (
                  row.assignmentStates.map((state) => (
                    <Badge key={state} variant="outline" className="mr-1 h-5 font-normal">
                      {ASSIGNMENT_STATE_LABEL[state]}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="h-5 font-normal">
                    Active · PIM n/a
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">{relativeDays(row.lastActivityAt)}</TableCell>
              <TableCell className="hidden font-mono text-xs lg:table-cell">{row.lastReviewedAt ? formatDate(row.lastReviewedAt) : 'Never'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
