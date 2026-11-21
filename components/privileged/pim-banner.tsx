import { AlertTriangle } from 'lucide-react'
import type { PrivilegedPimStatus } from '@/lib/types'

export function PimBanner({ pim }: { pim: PrivilegedPimStatus }) {
  if (pim === 'available') return null
  const copy =
    pim === 'needs_consent'
      ? 'Privileged Identity Management reads need consent. Eligible assignments are not inventoried until that permission is granted.'
      : pim === 'unavailable'
        ? 'This tenant does not have Privileged Identity Management. Standing assignments show as Active. Eligible (JIT) is not available.'
        : 'PIM status is unknown. Eligible assignments may be incomplete.'
  return (
    <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm" role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex flex-col gap-1">
        <span className="font-medium">Needs P2</span>
        <span className="text-muted-foreground text-sm">{copy}</span>
      </div>
    </div>
  )
}
