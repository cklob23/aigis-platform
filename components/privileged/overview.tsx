import Link from 'next/link'
import { StatCard } from '@/components/dashboard/stat-card'
import { AssignmentMixBar } from '@/components/privileged/assignment-mix'
import { PrivilegedReviewsCard } from '@/components/privileged/reviews-card'
import { TierBadge } from '@/components/privileged/tier-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { pimUnavailableStandingLabel } from '@/lib/privileged/copy'
import {
  privilegedClassLabel,
  TIER_HINT,
  TIER_LABEL,
  type PrivilegedHighestRisk,
  type PrivilegedSummary,
} from '@/lib/privileged/view'
import { formatDate, formatNumber, relativeDays } from '@/lib/format'
import { RiskBadge } from '@/components/risk/risk-badge'
import { DORMANT_ADMIN_DAYS, daysSince, privilegedReviewPastCadence } from '@/lib/risk/privileged'

export function PrivilegedOverview({
  summary,
  highestRisk = [],
  links = true,
}: {
  summary: PrivilegedSummary
  highestRisk?: PrivilegedHighestRisk[]
  links?: boolean
}) {
  const standingHint = summary.pimAvailable
    ? `Permanent assignments ${formatNumber(summary.standing)} / of ${formatNumber(summary.assignments)}, PIM available`
    : pimUnavailableStandingLabel(summary.assignments)

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Privileged totals">
        {([0, 1, 2] as const).map((tier) => (
          <StatCard
            key={tier}
            label={`${TIER_LABEL[tier]} holders`}
            value={tier === 0 ? summary.byTier.t0 : tier === 1 ? summary.byTier.t1 : summary.byTier.t2}
            href={links ? `/privileged?tab=holders&tier=${tier}` : undefined}
            hint={TIER_HINT[tier]}
          />
        ))}
        <StatCard
          label={summary.pimAvailable ? 'Permanent assignments' : 'Assignments'}
          value={summary.standing}
          href={links ? '/privileged?tab=holders' : undefined}
          hint={standingHint}
        />
        <StatCard
          label="Dormant admins"
          value={summary.dormant}
          href={links ? '/privileged?tab=holders' : undefined}
          tone={summary.dormant > 0 ? 'warning' : 'default'}
          hint="no sign-in 90d+"
        />
        <StatCard
          label="External identities with roles"
          value={summary.whoHolds.guests}
          href={links ? '/privileged?tab=holders&class=external' : undefined}
          hint={`plus ${formatNumber(summary.whoHolds.servicePrincipals)} service principals`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Standing vs just-in-time</CardTitle>
          <CardDescription>
            {summary.pimAvailable
              ? 'Assignment mix across privileged directory roles.'
              : pimUnavailableStandingLabel(summary.assignments)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AssignmentMixBar summary={summary} showTitle={false} />
          {summary.pimAvailable && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Tier</TableHead>
                    <TableHead>Holders</TableHead>
                    <TableHead>Permanent</TableHead>
                    <TableHead>Eligible</TableHead>
                    <TableHead>Time-bound</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([0, 1, 2] as const).map((tier) => {
                    const row = tier === 0 ? summary.byTierAssignments.t0 : tier === 1 ? summary.byTierAssignments.t1 : summary.byTierAssignments.t2
                    return (
                      <TableRow key={tier}>
                        <TableCell>
                          <TierBadge tier={tier} />
                        </TableCell>
                        <TableCell className="tnum">{formatNumber(row.holders)}</TableCell>
                        <TableCell className="tnum">{formatNumber(row.permanent)}</TableCell>
                        <TableCell className="tnum">{formatNumber(row.eligible)}</TableCell>
                        <TableCell className="tnum">{formatNumber(row.timeBound)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {links && highestRisk.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Highest-risk role holders</CardTitle>
            <CardDescription>Privilege is a flag on the identity. Ranked by current risk score.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Identity</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Highest tier</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {highestRisk.map((row) => (
                  <HighestRiskRow key={row.identityId} row={row} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Who holds roles</CardTitle>
            <CardDescription>Privilege is a flag on the identity, not a separate type.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y text-sm">
            <CountRow label="Internal user" value={summary.whoHolds.internalUser} />
            <CountRow label="Dedicated admin" value={summary.whoHolds.dedicatedAdmin} />
            <CountRow label="Guests" value={summary.whoHolds.guests} />
            <CountRow label="Service principals" value={summary.whoHolds.servicePrincipals} />
            <CountRow label="Identities via groups" value={summary.whoHolds.viaGroups} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tenant findings</CardTitle>
            <CardDescription>Counts only. Identity names are not listed here.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.findings.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open privileged findings.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {summary.findings.map((f) => (
                  <li key={f.finding_type} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm">{f.title}</span>
                      <span className="tnum font-medium text-sm">{formatNumber(f.count)}</span>
                    </div>
                    {f.explanation && <p className="text-muted-foreground text-xs">{f.explanation}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Review cadence</CardTitle>
            <CardDescription>
              {formatNumber(summary.overdueReviews)} overdue, {formatNumber(summary.neverReviewed)} never reviewed
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Last privileged review</span>
              <span className="tnum">{formatDate(summary.reviews.lastCompletedAt ?? summary.lastPrivilegedReviewAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Next due</span>
              <span className="tnum">{formatDate(summary.reviews.nextDueAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Overdue</span>
              <span className="tnum">{formatNumber(summary.overdueReviews)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Never reviewed</span>
              <span className="tnum">{formatNumber(summary.neverReviewed)}</span>
            </div>
          </CardContent>
        </Card>
        <PrivilegedReviewsCard reviews={summary.reviews} />
      </section>
    </div>
  )
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
      <span>{label}</span>
      <span className="tnum font-medium">{formatNumber(value)}</span>
    </div>
  )
}

function HighestRiskRow({ row }: { row: PrivilegedHighestRisk }) {
  const idle = daysSince(row.lastActivityAt)
  const dormant = row.lastActivityAt == null || (idle !== null && idle >= DORMANT_ADMIN_DAYS)
  const overdue = privilegedReviewPastCadence(row.lastReviewedAt)
  return (
    <TableRow>
      <TableCell>
        <Link href={`/privileged?tab=holders&q=${encodeURIComponent(row.displayName ?? row.email ?? '')}`} className="flex min-w-0 flex-col hover:underline">
          <span className="font-medium">{row.displayName ?? row.email}</span>
          <span className="truncate font-mono text-muted-foreground text-xs">{row.email}</span>
        </Link>
      </TableCell>
      <TableCell className="text-xs">{privilegedClassLabel(row.identityClass, row.dedicatedAdmin)}</TableCell>
      <TableCell>
        <TierBadge tier={row.privilegeTier} />
      </TableCell>
      <TableCell className="max-w-56 truncate text-sm">{row.roleNames.join(', ')}</TableCell>
      <TableCell className={dormant ? 'tnum text-destructive' : 'tnum'}>{relativeDays(row.lastActivityAt)}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          <RiskBadge level={row.riskLevel} />
          <span className="tnum text-xs">{row.riskScore}</span>
          {overdue && <span className="rounded bg-[#FEF3C7] px-1 text-[10px] font-medium text-[#B45309]">Overdue</span>}
        </div>
      </TableCell>
    </TableRow>
  )
}
