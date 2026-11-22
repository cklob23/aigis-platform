import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TierBadge } from '@/components/privileged/tier-badge'
import { ASSIGNMENT_CHANGE_LABEL, type PrivilegedProfileAssignment } from '@/lib/privileged/profile'
import { formatDate, titleCase } from '@/lib/format'

export function AssignmentsTable({
  assignments,
  pimAvailable,
}: {
  assignments: PrivilegedProfileAssignment[]
  pimAvailable: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Role assignments</CardTitle>
        <CardDescription>
          {pimAvailable
            ? 'Active, eligible, and time-bound directory roles on this identity.'
            : 'Active directory roles. Eligible vs permanent needs Entra ID P2.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>Role</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="hidden md:table-cell">Member</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="hidden lg:table-cell">Ends</TableHead>
                <TableHead>Recommended</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.roleName}</TableCell>
                  <TableCell>
                    <TierBadge tier={row.privilegeTier} />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="h-5 font-normal">
                      {row.stateLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden capitalize text-xs md:table-cell">{titleCase(row.memberType)}</TableCell>
                  <TableCell className="text-xs">{row.scopeLabel}</TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">{formatDate(row.endsAt)}</TableCell>
                  <TableCell className="text-xs">
                    {row.recommendedChange ? ASSIGNMENT_CHANGE_LABEL[row.recommendedChange] : 'Keep'}
                  </TableCell>
                  <TableCell>
                    {row.entraUrl ? (
                      <a href={row.entraUrl} target="_blank" rel="noreferrer" aria-label={`Open ${row.roleName} in Microsoft Entra`} className="text-muted-foreground hover:text-foreground">
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {assignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                    No privileged role assignments.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

