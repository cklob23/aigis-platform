import { Badge } from '@/components/ui/badge'
import { formatDate, titleCase } from '@/lib/format'
import type { EmailLogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

export function EmailLog({ entries }: { entries: EmailLogEntry[] }) {
  if (entries.length === 0) return <p className="text-muted-foreground text-sm">No emails have been sent yet.</p>
  return (
    <ul className="flex flex-col divide-y">
      {entries.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 md:flex-row md:items-start md:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate font-medium">{e.subject}</span>
              <Badge variant="outline" className="text-xs">
                {titleCase(e.kind.replace(/_/g, ' '))}
              </Badge>
              <Badge variant="outline" className={cn('capitalize text-xs', e.status === 'sent' && 'border-success/40 text-success', e.status === 'failed' && 'border-destructive/40 text-destructive', e.status === 'skipped' && 'text-muted-foreground')}>
                {e.status}
              </Badge>
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              to {e.recipients.join(', ') || '—'}
              {e.sender ? ` · from ${e.sender}` : ''}
            </span>
            {e.error && <span className="text-destructive text-xs">{e.error}</span>}
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">{formatDate(e.created_at, true)}</span>
        </li>
      ))}
    </ul>
  )
}
