import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listScans } from '@/lib/data/governance'
import { PageHeader } from '@/components/layout/page-header'
import { ScanButton } from '@/components/scans/scan-button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate, titleCase } from '@/lib/format'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Scans' }

const SCOPES = [
  { scope: 'User.Read.All', purpose: 'Enumerate guest users, sign-in activity, sponsors', type: 'Application' },
  { scope: 'Group.Read.All', purpose: 'Teams, Microsoft 365 Groups, security groups and their members/owners', type: 'Application' },
  { scope: 'Sites.Read.All', purpose: 'SharePoint sites connected to groups', type: 'Application' },
  { scope: 'Application.Read.All', purpose: 'Enterprise app assignments held by guests', type: 'Application' },
  { scope: 'AuditLog.Read.All', purpose: 'Last interactive / non-interactive sign-in timestamps', type: 'Application' },
  { scope: 'Organization.Read.All', purpose: 'Verified domains and tenant name', type: 'Application' },
  { scope: 'User.ReadWrite.All · GroupMember.ReadWrite.All', purpose: 'Only when remediation is enabled: remove memberships, disable guests', type: 'Application (optional)' },
]

export default async function ScansPage() {
  const { session, tenant } = await requireOnboarded()
  const scans = await listScans(tenant.id)
  const running = scans.find((s) => s.status === 'running' || s.status === 'queued')
  const schedule = (tenant.settings.scan_schedule as string) ?? 'daily'

  return (
    <>
      <PageHeader
        title="Discovery scans"
        description={`Schedule: ${schedule}. Scans read-only enumerate guests, groups, sites and app assignments through Microsoft Graph, diff against the last inventory, then re-score risk.`}
        actions={can(session.role, 'scan.run') ? <ScanButton initialJobId={running?.id ?? null} /> : null}
      />

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Started</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right md:table-cell">External identities</TableHead>
              <TableHead className="hidden text-right md:table-cell">Groups</TableHead>
              <TableHead className="hidden text-right lg:table-cell">New / removed</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Critical</TableHead>
              <TableHead className="hidden xl:table-cell">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans.map((s) => {
              const dur = s.started_at && s.completed_at ? Math.max(1, Math.round((new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000)) : null
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{formatDate(s.started_at ?? s.created_at, true)}</TableCell>
                  <TableCell className="text-xs">{titleCase(s.scan_type)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('capitalize', s.status === 'completed' && 'border-success/40 text-success', s.status === 'failed' && 'border-destructive/40 text-destructive', s.status === 'running' && 'border-primary/40 text-primary')}>
                      {s.status}
                      {s.status === 'running' && ` · ${s.progress?.percent ?? 0}%`}
                    </Badge>
                    {s.error && <span className="ml-2 text-destructive text-xs">{s.error}</span>}
                  </TableCell>
                  <TableCell className="tnum hidden text-right font-mono text-xs md:table-cell">{s.summary?.guests ?? '—'}</TableCell>
                  <TableCell className="tnum hidden text-right font-mono text-xs md:table-cell">{s.summary?.groups ?? '—'}</TableCell>
                  <TableCell className="tnum hidden text-right font-mono text-xs lg:table-cell">
                    <span className="text-success">+{s.summary?.new_guests ?? 0}</span> / <span className="text-destructive">−{s.summary?.removed_guests ?? 0}</span>
                  </TableCell>
                  <TableCell className="tnum hidden text-right font-mono text-xs lg:table-cell">{s.summary?.critical ?? '—'}</TableCell>
                  <TableCell className="hidden font-mono text-muted-foreground text-xs xl:table-cell">{dur ? `${dur}s` : '—'}</TableCell>
                </TableRow>
              )
            })}
            {scans.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No scans yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Graph permissions in use</CardTitle>
          <CardDescription>Granted via tenant-wide admin consent. AIGIS never reads message or file content.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-[auto_1fr_auto]">
            {SCOPES.map((s) => (
              <div key={s.scope} className="contents">
                <dt className="font-mono text-xs">{s.scope}</dt>
                <dd className="text-muted-foreground text-xs">{s.purpose}</dd>
                <dd className="text-muted-foreground text-xs">{s.type}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </>
  )
}
