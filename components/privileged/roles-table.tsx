import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TierBadge } from '@/components/privileged/tier-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AZURE_RBAC_FILTER_PILL, EXCLUDED_ROLES_NOTE, TIER_1_DEFINITION, TIER_2_DEFINITION, TIERS_FIXED_NOTE, privilegedRolesSubtitle } from '@/lib/privileged/copy'
import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'
import type { PrivilegedRoleListItem } from '@/lib/privileged/view'
import { formatDate, formatNumber } from '@/lib/format'
import { privilegedReviewPastCadence } from '@/lib/risk/privileged'
import { cn } from '@/lib/utils'

export function RolesTable({ roles, pimAvailable }: { roles: PrivilegedRoleListItem[]; pimAvailable: boolean }) {
  const privileged = roles.filter((row) => row.isPrivileged)
  const held = privileged.filter((row) => row.holderCount > 0).length
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-muted-foreground text-sm">{privilegedRolesSubtitle(privileged.length, held)}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border bg-background px-3 py-1 font-medium">Entra ID directory</span>
          <span className="rounded-full border border-dashed px-3 py-1 text-muted-foreground">{AZURE_RBAC_FILTER_PILL}</span>
        </div>
        <div className="hidden overflow-x-auto rounded-lg border sm:block">
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Role</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Holders</TableHead>
                <TableHead>{pimAvailable ? 'Permanent' : 'Active'}</TableHead>
                {pimAvailable && <TableHead>Eligible</TableHead>}
                <TableHead className="whitespace-nowrap">Last review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {privileged.map((role) => {
                const empty = role.holderCount === 0
                return (
                  <TableRow key={role.id} className={cn(empty && 'text-muted-foreground')}>
                    <TableCell>
                      <div className="flex min-w-0 flex-col">
                        <span className={cn('font-medium', empty && 'font-normal')}>{role.displayName}</span>
                        {role.description ? (
                          <span className="line-clamp-1 text-muted-foreground text-xs">{role.description}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={role.privilegeTier} />
                    </TableCell>
                    <TableCell>
                      <span className="tnum text-sm font-normal text-card-foreground">{formatNumber(role.holderCount)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="tnum text-sm font-normal text-card-foreground">{formatNumber(role.standingCount)}</span>
                    </TableCell>
                    {pimAvailable && (
                      <TableCell>
                        <span className="tnum text-sm font-normal text-card-foreground">{formatNumber(role.eligibleCount)}</span>
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">
                      <LastReviewCell role={role} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col overflow-hidden rounded-lg border sm:hidden">
          {privileged.map((role) => (
            <RoleStackedCard key={role.id} role={role} pimAvailable={pimAvailable} />
          ))}
        </div>
        <p className="text-muted-foreground text-xs">{EXCLUDED_ROLES_NOTE}</p>
      </div>
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Tier definitions</CardTitle>
          <CardDescription>{TIERS_FIXED_NOTE}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <p className="mb-1 font-medium">Tier 0</p>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground text-xs">
              {TIER_0_DIRECTORY_ROLES.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 font-medium">Tier 1</p>
            <p className="text-muted-foreground text-xs">{TIER_1_DEFINITION}</p>
          </div>
          <div>
            <p className="mb-1 font-medium">Tier 2</p>
            <p className="text-muted-foreground text-xs">{TIER_2_DEFINITION}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function lastReviewLabel(role: PrivilegedRoleListItem) {
  if (role.holderCount === 0) return 'n/a'
  if (!role.lastReviewAt) return 'Never'
  return formatDate(role.lastReviewAt)
}

function LastReviewCell({ role }: { role: PrivilegedRoleListItem }) {
  const overdue = Boolean(role.lastReviewAt && role.holderCount > 0 && privilegedReviewPastCadence(role.lastReviewAt))
  const never = role.holderCount > 0 && !role.lastReviewAt
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 tnum text-sm font-normal', (overdue || never) && 'text-warning')}>
      {lastReviewLabel(role)}
      {overdue && (
        <span className="rounded bg-[#FEF3C7] px-1 text-[10px] font-medium text-[#B45309] dark:bg-warning/15 dark:text-[#F5AE39]">
          Overdue
        </span>
      )}
    </span>
  )
}

function RoleStackedCard({ role, pimAvailable }: { role: PrivilegedRoleListItem; pimAvailable: boolean }) {
  const empty = role.holderCount === 0
  const last = lastReviewLabel(role)
  const overdue = Boolean(role.lastReviewAt && role.holderCount > 0 && privilegedReviewPastCadence(role.lastReviewAt))
  return (
    <div className={cn('flex flex-col gap-1.5 border-b px-3 py-3 last:border-b-0', empty && 'text-muted-foreground')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('font-medium text-sm', empty && 'font-normal')}>{role.displayName}</span>
        <TierBadge tier={role.privilegeTier} />
      </div>
      {role.privilegeTier === 0 && role.description ? (
        <span className="text-muted-foreground text-xs">{role.description}</span>
      ) : null}
      <p className="text-muted-foreground text-xs">
        Holders {formatNumber(role.holderCount)}
        {' · '}
        {pimAvailable ? 'Permanent' : 'Active'} {formatNumber(role.standingCount)}
        {pimAvailable ? ` · Eligible ${formatNumber(role.eligibleCount)}` : ''}
        {' · Last review '}
        <span className={cn((overdue || (role.holderCount > 0 && !role.lastReviewAt)) && 'text-warning')}>
          {last}
          {overdue ? ' · Overdue' : ''}
        </span>
      </p>
    </div>
  )
}
