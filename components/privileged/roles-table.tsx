import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { TierBadge } from '@/components/privileged/tier-badge'
import { AZURE_RBAC_COMING_LATER } from '@/lib/privileged/copy'
import type { PrivilegedRoleListItem } from '@/lib/privileged/view'
import { formatNumber } from '@/lib/format'

export function RolesTable({ roles, pimAvailable }: { roles: PrivilegedRoleListItem[]; pimAvailable: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
        <span>Azure RBAC</span>
        <Badge variant="outline">{AZURE_RBAC_COMING_LATER}</Badge>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Role</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Holders</TableHead>
              <TableHead>{pimAvailable ? 'Standing' : 'Active'}</TableHead>
              {pimAvailable && <TableHead>Eligible</TableHead>}
              <TableHead className="hidden md:table-cell">Kind</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => (
              <TableRow key={role.id}>
                <TableCell>
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{role.displayName}</span>
                    {role.description && <span className="line-clamp-1 text-muted-foreground text-xs">{role.description}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  <TierBadge tier={role.privilegeTier} />
                </TableCell>
                <TableCell className="tnum font-mono text-xs">{formatNumber(role.holderCount)}</TableCell>
                <TableCell className="tnum font-mono text-xs">{formatNumber(role.standingCount)}</TableCell>
                {pimAvailable && <TableCell className="tnum font-mono text-xs">{formatNumber(role.eligibleCount)}</TableCell>}
                <TableCell className="hidden md:table-cell">
                  <span className="text-muted-foreground text-xs">{role.isBuiltIn ? 'Built-in' : 'Custom'}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
