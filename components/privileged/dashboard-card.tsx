import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import type { PrivilegedSummary } from '@/lib/privileged/view'

export function PrivilegedDashboardCard({ summary }: { summary: PrivilegedSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Privileged access</CardTitle>
        <CardDescription>Directory role holders in this tenant</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/privileged" />}>
            Open <ArrowRight data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Identities</span>
          <span className="tnum font-semibold text-2xl">{formatNumber(summary.holders)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Tier 0</span>
          <span className="tnum font-semibold text-2xl">{formatNumber(summary.byTier.t0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">{summary.pimAvailable ? 'Standing' : 'Active'}</span>
          <span className="tnum font-semibold text-2xl">{formatNumber(summary.standing)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">Eligible (JIT)</span>
          <span className="tnum font-semibold text-2xl">{summary.pimAvailable ? formatNumber(summary.jitEligible) : 'Needs P2'}</span>
        </div>
      </CardContent>
    </Card>
  )
}
