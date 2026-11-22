import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PIM_ACTIVATION_NOTE, PIM_ACTIVATION_WINDOW } from '@/lib/privileged/copy'
import type { PrivilegedActivation } from '@/lib/privileged/profile'
import { formatDate } from '@/lib/format'

export function ActivationHistory({ activations }: { activations: PrivilegedActivation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>PIM activation history</CardTitle>
        <CardDescription>
          {PIM_ACTIVATION_WINDOW}. {PIM_ACTIVATION_NOTE}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col divide-y rounded-lg border">
          {activations.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className="w-40 shrink-0 font-mono text-muted-foreground text-xs">{formatDate(row.activatedAt, true)}</span>
              <span className="font-medium">{row.roleName}</span>
              {row.durationMinutes != null && <span className="tnum text-muted-foreground text-xs">{row.durationMinutes} min</span>}
              {row.result && <span className="capitalize text-xs">{row.result}</span>}
              {row.ticket && <span className="font-mono text-muted-foreground text-xs">{row.ticket}</span>}
            </li>
          ))}
          {activations.length === 0 && (
            <li className="p-6 text-center text-muted-foreground text-sm">No activations in the last 30 days.</li>
          )}
        </ol>
      </CardContent>
    </Card>
  )
}
