import { ClipboardCheck, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PrivilegedIdentityProfile } from '@/lib/privileged/profile'
import { formatDate, titleCase } from '@/lib/format'
import { cn } from '@/lib/utils'

const PREVIEW_TAG =
  'rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'

function reviewOutcome(decision: string | null, status: string, decidedAt: string | null) {
  const label = titleCase(decision ?? status)
  const when = decidedAt ? formatDate(decidedAt) : null
  return when ? `${label} ${when}` : label
}

export function RequestsReviews({ profile }: { profile: PrivilegedIdentityProfile }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4" /> Reviews
            <span className={PREVIEW_TAG}>Preview</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {profile.reviews.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5 py-2 text-sm">
              <span className="text-pretty">{r.name}</span>
              <span className="text-muted-foreground text-xs">{reviewOutcome(r.decision, r.status, r.decidedAt)}</span>
            </div>
          ))}
          {profile.reviews.length === 0 && <p className="text-muted-foreground text-sm">Never included in a privileged review.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-4" /> Requests
            <span className={PREVIEW_TAG}>Soon</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {profile.requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-0.5 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="capitalize">{titleCase(r.actionType)}</span>
                <Badge variant="outline" className={cn('capitalize', r.status === 'pending' && 'border-warning/40 text-warning')}>
                  {r.status}
                </Badge>
              </div>
              <span className="text-muted-foreground text-xs">{formatDate(r.createdAt, true)}</span>
            </div>
          ))}
          {profile.requests.length === 0 && (
            <p className="text-muted-foreground text-sm">No privileged change requests. Requesting a change comes in a later release.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
