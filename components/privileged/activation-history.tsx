import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PIM_ACTIVATION_NOTE, PIM_ACTIVATION_WINDOW } from '@/lib/privileged/copy'
import { activationApprovalLabel, type PrivilegedActivation } from '@/lib/privileged/profile'
import { formatDateTimeEt } from '@/lib/format'

function durationLabel(minutes: number | null) {
  return minutes != null ? `${minutes} min` : 'None'
}

export function ActivationHistory({ activations }: { activations: PrivilegedActivation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>PIM activation history</CardTitle>
        <CardDescription>
          {PIM_ACTIVATION_WINDOW}. {PIM_ACTIVATION_NOTE}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium">Ticket</th>
                <th className="px-4 py-2 font-medium">Approval</th>
              </tr>
            </thead>
            <tbody>
              {activations.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs whitespace-nowrap">
                    {formatDateTimeEt(row.activatedAt)}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{row.roleName}</td>
                  <td className="tnum px-4 py-2.5 text-muted-foreground text-xs">{durationLabel(row.durationMinutes)}</td>
                  <td className="px-4 py-2.5 capitalize text-xs">{row.result ?? 'None'}</td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground text-xs">{row.ticket ?? 'None'}</td>
                  <td className="px-4 py-2.5 text-xs">{activationApprovalLabel(row)}</td>
                </tr>
              ))}
              {activations.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">
                    No activations in the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col sm:hidden">
          {activations.map((row) => (
            <div key={row.id} className="flex flex-col gap-1.5 border-t px-4 py-3 first:border-t-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{row.roleName}</span>
                <span className="font-mono text-muted-foreground text-xs">{formatDateTimeEt(row.activatedAt)}</span>
              </div>
              <p className="text-muted-foreground text-xs text-pretty">
                {durationLabel(row.durationMinutes)} · {row.result ?? 'None'} · {row.ticket ?? 'None'} · {activationApprovalLabel(row)}
              </p>
            </div>
          ))}
          {activations.length === 0 && (
            <p className="px-4 py-8 text-center text-muted-foreground text-sm">No activations in the last 30 days.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
