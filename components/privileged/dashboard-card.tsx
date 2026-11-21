import Link from 'next/link'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AssignmentMixBar } from '@/components/privileged/assignment-mix'
import { formatNumber } from '@/lib/format'
import { privilegedDashboardCardSubtitle } from '@/lib/privileged/copy'
import { TIER_HINT, TIER_LABEL, type PrivilegedSummary } from '@/lib/privileged/view'

export function PrivilegedDashboardCard({ summary }: { summary: PrivilegedSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privileged access</CardTitle>
        <CardDescription>{privilegedDashboardCardSubtitle(summary.holders, summary.assignments)}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/privileged" />}>
            Open privileged access
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          {([0, 1, 2] as const).map((tier) => (
            <div key={tier} className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">{TIER_LABEL[tier]} holders</span>
              <span className="tnum font-semibold text-2xl">{formatNumber(tier === 0 ? summary.byTier.t0 : tier === 1 ? summary.byTier.t1 : summary.byTier.t2)}</span>
              <span className="text-muted-foreground text-xs">{TIER_HINT[tier]}</span>
            </div>
          ))}
        </div>
        <AssignmentMixBar summary={summary} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">Dormant admins</span>
            <span className="tnum font-semibold text-xl">{formatNumber(summary.dormant)}</span>
            <span className="text-muted-foreground text-xs">no sign-in 90d+</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs uppercase tracking-wide">External identities with roles</span>
            <span className="tnum font-semibold text-xl">{formatNumber(summary.whoHolds.guests)}</span>
            <span className="text-muted-foreground text-xs">
              plus {formatNumber(summary.whoHolds.servicePrincipals)} service principals
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
