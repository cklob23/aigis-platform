import { formatNumber } from '@/lib/format'
import type { PrivilegedSummary } from '@/lib/privileged/view'

export function AssignmentMixBar({ summary, showTitle = true }: { summary: PrivilegedSummary; showTitle?: boolean }) {
  if (!summary.pimAvailable) {
    return (
      <div className="flex flex-col gap-2">
        {showTitle ? <span className="font-medium text-sm">Standing vs just-in-time</span> : null}
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full bg-foreground/40" />
        </div>
      </div>
    )
  }

  const total = Math.max(1, summary.standing + summary.jitEligible + summary.timeBound)
  const segments = [
    { key: 'permanent', label: 'Permanent', value: summary.standing, className: 'bg-foreground/80' },
    { key: 'eligible', label: 'Eligible', value: summary.jitEligible, className: 'bg-primary' },
    { key: 'time_bound', label: 'Time-bound', value: summary.timeBound, className: 'bg-muted-foreground/50' },
  ] as const

  return (
    <div className="flex flex-col gap-2">
      {showTitle ? <span className="font-medium text-sm">Standing vs just-in-time</span> : null}
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={seg.className}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={`${seg.label} ${formatNumber(seg.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {segments.map((seg) => (
          <span key={seg.key} className="inline-flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${seg.className}`} />
            {seg.label} {formatNumber(seg.value)}
          </span>
        ))}
      </div>
    </div>
  )
}
