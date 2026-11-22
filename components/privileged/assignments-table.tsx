import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TierBadge } from '@/components/privileged/tier-badge'
import { ASSIGNMENT_CHANGE_LABEL, type PrivilegedProfileAssignment } from '@/lib/privileged/profile'
import { OPEN_ROLE_DEFINITION } from '@/lib/privileged/copy'
import { formatDate, titleCase } from '@/lib/format'

function endsLabel(endsAt: string | null) {
  return endsAt ? formatDate(endsAt) : 'No end'
}

function RoleDefinitionLink({ row }: { row: PrivilegedProfileAssignment }) {
  if (!row.entraUrl) return null
  return (
    <a
      href={row.entraUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={OPEN_ROLE_DEFINITION}
      title={OPEN_ROLE_DEFINITION}
      className="text-muted-foreground hover:text-foreground"
    >
      <ExternalLink className="size-3.5" />
    </a>
  )
}

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
        <div className="hidden sm:block">
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
                  <TableCell className="hidden text-xs lg:table-cell">{endsLabel(row.endsAt)}</TableCell>
                  <TableCell className="text-xs">
                    {row.recommendedChange ? ASSIGNMENT_CHANGE_LABEL[row.recommendedChange] : 'Keep'}
                  </TableCell>
                  <TableCell>
                    <RoleDefinitionLink row={row} />
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
        <div className="flex flex-col sm:hidden">
          {assignments.map((row) => (
            <div key={row.id} className="flex flex-col gap-1.5 border-t px-4 py-3 first:border-t-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-medium">{row.roleName}</span>
                  <TierBadge tier={row.privilegeTier} />
                  <Badge variant="outline" className="h-5 font-normal">
                    {row.stateLabel}
                  </Badge>
                </div>
                <RoleDefinitionLink row={row} />
              </div>
              <p className="text-muted-foreground text-xs">
                {titleCase(row.memberType)} · {row.scopeLabel} · {endsLabel(row.endsAt)}
              </p>
              <p className="text-xs">{row.recommendedChange ? ASSIGNMENT_CHANGE_LABEL[row.recommendedChange] : 'Keep'}</p>
            </div>
          ))}
          {assignments.length === 0 && (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No privileged role assignments.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
