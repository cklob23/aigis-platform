import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { RiskFactor } from '@/lib/types'
import { cn } from '@/lib/utils'

export function RiskFactorList({ factors, children }: { factors: RiskFactor[]; children?: ReactNode }) {
  const sorted = [...factors].sort((a, b) => b.points - a.points)
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Why this score</CardTitle>
        <CardDescription>Each factor adds points. The total is capped at 100. Informational lines score 0.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {sorted.map((f) => (
          <div key={f.key} className="flex items-start gap-3 sm:items-center">
            <span className="tnum w-10 text-right font-mono text-sm">{f.points > 0 ? `+${f.points}` : '0'}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', f.points >= 25 ? 'bg-destructive' : f.points >= 12 ? 'bg-warning' : 'bg-primary')}
                style={{ width: `${Math.min(100, f.points * 3)}%` }}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-pretty text-sm">{f.label}</span>
              {f.detail && <span className="text-pretty text-muted-foreground text-xs">{f.detail}</span>}
            </div>
          </div>
        ))}
        {sorted.length === 0 && <p className="text-muted-foreground text-sm">No risk factors recorded for this identity.</p>}
        {children}
      </CardContent>
    </Card>
  )
}
