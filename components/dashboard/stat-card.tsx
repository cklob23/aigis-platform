import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

export function StatCard({
  label,
  value,
  delta,
  deltaLabel = 'vs 7 days ago',
  deltaGoodWhenDown = true,
  hint,
  href,
  tone = 'default',
}: {
  label: string
  value: number | string
  /** Change versus the comparison snapshot; null when there is nothing to compare against. */
  delta?: number | null
  /** What the delta is measured against; rendered next to the number so it is never ambiguous. */
  deltaLabel?: string
  deltaGoodWhenDown?: boolean
  hint?: string
  href?: string
  tone?: 'default' | 'critical' | 'warning' | 'primary'
}) {
  const hasDelta = typeof delta === 'number'
  const signed = hasDelta ? (delta > 0 ? `+${formatNumber(delta)}` : delta < 0 ? `−${formatNumber(Math.abs(delta))}` : '0') : null
  const deltaTone = !hasDelta || delta === 0 ? 'text-muted-foreground' : (delta < 0) === deltaGoodWhenDown ? 'text-success' : 'text-destructive'

  const body = (
    <div className={cn('flex h-full flex-col justify-between gap-3 rounded-lg border bg-card p-4', href && 'transition-colors hover:bg-accent/40')}>
      <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
      <div className="flex flex-col gap-1">
        <span className={cn('tnum font-semibold text-3xl tracking-tight', tone === 'critical' && 'text-destructive', tone === 'warning' && 'text-warning', tone === 'primary' && 'text-primary')}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </span>
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-xs">
          {hint && <span className="text-muted-foreground">{hint}</span>}
          {hasDelta && (
            <span className={cn('tnum inline-flex items-center gap-0.5 font-mono', deltaTone)} title={`${signed} ${deltaLabel}`}>
              {delta === 0 ? <Minus className="size-3" /> : delta < 0 ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
              {signed}
              <span className="ml-1 font-sans text-muted-foreground">{deltaLabel}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {body}
    </Link>
  ) : (
    body
  )
}
