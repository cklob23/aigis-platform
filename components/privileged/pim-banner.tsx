import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  ENTRA_P2_DOCS,
  PIM_BANNER_BODY,
  PIM_BANNER_TITLE,
  PIM_NOT_AVAILABLE,
  PIM_STILL_WORKS,
} from '@/lib/privileged/copy'
import type { PrivilegedPimStatus } from '@/lib/types'

export function PimBanner({ pim, recheck }: { pim: PrivilegedPimStatus; recheck?: ReactNode }) {
  if (pim === 'available') return null
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm" role="status">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="flex flex-col gap-1">
          <span className="font-medium">{PIM_BANNER_TITLE}</span>
          <span className="text-muted-foreground">{PIM_BANNER_BODY}</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-xs uppercase tracking-wide">Still works</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground text-sm">
            {PIM_STILL_WORKS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium text-xs uppercase tracking-wide">Not available without P2</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground text-sm">
            {PIM_NOT_AVAILABLE.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {recheck}
        <Button variant="ghost" size="sm" nativeButton={false} render={<a href={ENTRA_P2_DOCS} target="_blank" rel="noreferrer" />}>
          About Entra ID P2
        </Button>
      </div>
    </div>
  )
}
