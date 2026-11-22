import Link from 'next/link'
import { ClipboardCheck, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PrivilegedIdentityProfile } from '@/lib/privileged/profile'
import { formatDate, titleCase } from '@/lib/format'
import { cn } from '@/lib/utils'

export function RequestsReviews({ profile }: { profile: PrivilegedIdentityProfile }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="size-4" /> Reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {profile.reviews.map((r) => (
            <Link key={r.id} href={`/reviews/${r.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:underline">
              <span className="truncate">{r.name}</span>
              <Badge variant="outline" className="capitalize">
                {r.decision ?? r.status}
              </Badge>
            </Link>
          ))}
          {profile.reviews.length === 0 && <p className="text-muted-foreground text-sm">Never included in a privileged review.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-4" /> Requests
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
