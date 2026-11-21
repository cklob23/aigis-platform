import Link from 'next/link'
import { StatCard } from '@/components/dashboard/stat-card'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { IDENTITY_CLASS_LABEL, type PrivilegedSummary } from '@/lib/privileged/view'
import { formatDate, formatNumber } from '@/lib/format'
import type { IdentityClass } from '@/lib/types'

const CLASS_ORDER: IdentityClass[] = ['human_internal', 'external', 'non_human', 'group', 'agent']

export function PrivilegedOverview({ summary, links = true }: { summary: PrivilegedSummary; links?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Privileged totals">
        <StatCard label="Privileged identities" value={summary.holders} href={links ? '/privileged?tab=holders' : undefined} hint="directory role holders" />
        <StatCard
          label={summary.pimAvailable ? 'Standing' : 'Active'}
          value={summary.standing}
          href={links ? '/privileged?tab=holders' : undefined}
          hint={summary.pimAvailable ? 'permanent assignments' : 'PIM n/a'}
        />
        <StatCard
          label="Eligible (JIT)"
          value={summary.pimAvailable ? summary.jitEligible : 'Needs P2'}
          href={links && summary.pimAvailable ? '/privileged?tab=holders&state=eligible' : undefined}
          hint={summary.pimAvailable ? 'PIM eligible' : 'PIM n/a'}
        />
        <StatCard
          label="Review overdue"
          value={summary.overdueReviews + summary.neverReviewed}
          href={links ? '/privileged?tab=holders&review=overdue' : undefined}
          tone={summary.overdueReviews + summary.neverReviewed > 0 ? 'warning' : 'default'}
          hint={`${summary.neverReviewed} never reviewed`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>By class</CardTitle>
            <CardDescription>Privileged identities in inventory</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {CLASS_ORDER.map((cls) => (
              <div key={cls} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                <span className="text-sm">{IDENTITY_CLASS_LABEL[cls]}</span>
                <span className="tnum font-mono text-sm">{formatNumber(summary.byClass[cls])}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By tier</CardTitle>
            <CardDescription>Highest directory role on the identity</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {([0, 1, 2] as const).map((tier) => {
              const row = (
                <>
                  <span className="text-sm">Tier {tier}</span>
                  <span className="tnum font-mono text-sm">{formatNumber(tier === 0 ? summary.byTier.t0 : tier === 1 ? summary.byTier.t1 : summary.byTier.t2)}</span>
                </>
              )
              return links ? (
                <Link
                  key={tier}
                  href={`/privileged?tab=holders&tier=${tier}`}
                  className="-mx-2 flex items-center justify-between rounded-md px-2 py-2 hover:bg-accent/50 first:pt-0 last:pb-0"
                >
                  {row}
                </Link>
              ) : (
                <div key={tier} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  {row}
                </div>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Review cadence</CardTitle>
            <CardDescription>Fixed 90-day privileged review, independent of guest policy</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Last privileged review</span>
              <span className="font-mono text-xs">{formatDate(summary.lastPrivilegedReviewAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Overdue</span>
              <span className="tnum font-mono text-xs">{formatNumber(summary.overdueReviews)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Never reviewed</span>
              <span className="tnum font-mono text-xs">{formatNumber(summary.neverReviewed)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Dormant 90d+</span>
              <span className="tnum font-mono text-xs">{formatNumber(summary.dormant)}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Open privileged findings</CardTitle>
          <CardDescription>Counts only. Identity names are not listed here.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary.findings.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open privileged findings.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {summary.findings.map((f) => (
                <li key={f.finding_type} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                  <span className="text-sm">{f.title}</span>
                  <span className="tnum font-mono text-xs">{formatNumber(f.count)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
