import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TierBadge } from '@/components/privileged/tier-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AZURE_RBAC_FILTER_PILL, EXCLUDED_ROLES_NOTE, TIER_1_DEFINITION, TIER_2_DEFINITION, TIERS_FIXED_NOTE, privilegedRolesSubtitle } from '@/lib/privileged/copy'
import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'
import type { PrivilegedRoleListItem } from '@/lib/privileged/view'
import { formatDate, formatNumber } from '@/lib/format'
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
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Role</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Holders</TableHead>
                <TableHead>{pimAvailable ? 'Permanent' : 'Active'}</TableHead>
                {pimAvailable && <TableHead>Eligible</TableHead>}
                <TableHead>Last review</TableHead>
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
                        {role.description && <span className="line-clamp-1 text-muted-foreground text-xs">{role.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={role.privilegeTier} />
                    </TableCell>
                    <TableCell className="tnum text-sm">{formatNumber(role.holderCount)}</TableCell>
                    <TableCell className="tnum text-sm">{formatNumber(role.standingCount)}</TableCell>
                    {pimAvailable && <TableCell className="tnum text-sm">{formatNumber(role.eligibleCount)}</TableCell>}
                    <TableCell className={cn('tnum text-sm', !role.lastReviewAt && 'text-[#B45309]')}>
                      {role.lastReviewAt ? formatDate(role.lastReviewAt) : 'Never'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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
