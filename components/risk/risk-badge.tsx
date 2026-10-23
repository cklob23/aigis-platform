import { cn } from '@/lib/utils'
import type { RiskLevel } from '@/lib/types'

const STYLES: Record<RiskLevel, string> = {
  critical: 'bg-destructive/15 text-destructive ring-destructive/30',
  high: 'bg-warning/15 text-warning-foreground ring-warning/40 dark:text-warning',
  medium: 'bg-primary/10 text-primary ring-primary/25',
  low: 'bg-muted text-muted-foreground ring-border',
}

export function RiskBadge({ level, score, className }: { level: RiskLevel; score?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-xs capitalize ring-1 ring-inset', STYLES[level], className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', level === 'critical' ? 'bg-destructive' : level === 'high' ? 'bg-warning' : level === 'medium' ? 'bg-primary' : 'bg-muted-foreground')} />
      {level}
      {typeof score === 'number' && <span className="tnum font-mono opacity-80">{score}</span>}
    </span>
  )
}

export function RiskScoreBar({ score, level, className }: { score: number; level: RiskLevel; className?: string }) {
  const color = level === 'critical' ? 'bg-destructive' : level === 'high' ? 'bg-warning' : level === 'medium' ? 'bg-primary' : 'bg-muted-foreground'
  return (
    <div className={cn('flex items-center gap-2', className)} aria-label={`Risk score ${score} of 100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${score}%` }} />
      </div>
      <span className="tnum w-6 font-mono text-xs">{score}</span>
    </div>
  )
}

export function SeverityDot({ severity, className }: { severity: RiskLevel; className?: string }) {
  const color = severity === 'critical' ? 'bg-destructive' : severity === 'high' ? 'bg-warning' : severity === 'medium' ? 'bg-primary' : 'bg-muted-foreground'
  return <span aria-label={severity} className={cn('inline-block size-2 rounded-full', color, className)} />
}
