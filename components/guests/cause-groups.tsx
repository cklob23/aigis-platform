import Link from 'next/link'
import { ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'
import { RISK_CAUSES, type RiskCauseKey } from '@/lib/risk/recommendation'
import type { RiskLevel } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CauseGroups({
  risk,
  counts,
  total,
  activeCause,
  params,
}: {
  risk: RiskLevel
  counts: Record<RiskCauseKey, number>
  total: number
  activeCause?: RiskCauseKey
  params: Record<string, string | undefined>
}) {
  const hrefFor = (cause: RiskCauseKey | null) => {
    const next = new URLSearchParams(Object.entries(params).filter(([k, v]) => v && k !== 'page' && k !== 'cause') as [string, string][])
    if (cause) next.set('cause', cause)
    return `/guests?${next.toString()}`
  }
  const groups = RISK_CAUSES.map((c) => ({ ...c, count: counts[c.key] })).filter((c) => c.count > 0 || c.key === activeCause).sort((a, b) => b.count - a.count)
  const active = groups.find((g) => g.key === activeCause)

  return (
    <section aria-labelledby="cause-groups-heading" className="flex flex-col gap-2 rounded-lg border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="cause-groups-heading" className="font-medium text-sm">
            {risk === 'critical' ? 'Critical' : 'High'}-risk queue by cause
          </h2>
          <p className="text-muted-foreground text-xs">
            {active ? (
              <>
                Showing {formatNumber(total)} with <span className="text-foreground">{active.label.toLowerCase()}</span>. Groups are not exclusive, so this identity set overlaps with the other causes.
              </>
            ) : (
              <>
                {formatNumber(total)} identities. Groups are not exclusive: an identity can sit in several, so the counts below can add up to more than {formatNumber(total)}. Open a cause to filter within this risk
                level.
              </>
            )}
          </p>
        </div>
        {active && (
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={hrefFor(null)} />}>
            <X data-icon="inline-start" /> Clear cause
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y">
        {groups.map((g) => {
          const isActive = g.key === activeCause
          return (
            <li key={g.key} className={cn('flex items-center gap-4 px-4 py-2.5', isActive && 'bg-primary/5')}>
              <span className="tnum w-14 shrink-0 text-right font-mono text-lg tabular-nums">{formatNumber(g.count)}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-sm', isActive && 'font-medium')}>{g.label}</span>
                <span className="truncate text-muted-foreground text-xs">{g.description}</span>
              </div>
              <Button size="sm" variant={isActive ? 'secondary' : 'outline'} nativeButton={false} render={<Link href={hrefFor(g.key)} aria-current={isActive ? 'true' : undefined} />}>
                {isActive ? 'Viewing' : 'Open'}
                {!isActive && <ArrowRight data-icon="inline-end" />}
              </Button>
            </li>
          )
        })}
        {groups.length === 0 && <li className="px-4 py-6 text-center text-muted-foreground text-sm">No grouped causes at this level.</li>}
      </ul>
    </section>
  )
}
