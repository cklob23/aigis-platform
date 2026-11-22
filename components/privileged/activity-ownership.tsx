import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PrivilegedIdentityProfile } from '@/lib/privileged/profile'
import { formatDate, formatDateTimeEt, relativeDays } from '@/lib/format'
import { privilegedReviewDueOverdue } from '@/lib/privileged/view'
import { cn } from '@/lib/utils'

function nextReviewValue(iso: string | null) {
  if (!iso) return 'Not scheduled'
  if (privilegedReviewDueOverdue(iso)) {
    return <span className="text-warning">Overdue since {formatDate(iso)}</span>
  }
  return formatDate(iso)
}

export function ActivityOwnership({ profile }: { profile: PrivilegedIdentityProfile }) {
  const facts: { label: string; value: ReactNode }[] = [
    { label: 'Class', value: profile.classLabel },
    { label: 'Account', value: profile.accountEnabled ? 'Enabled' : <span className="text-destructive">Disabled</span> },
    {
      label: 'Last activity',
      value: (
        <span className={cn(!profile.lastActivityAt && 'text-destructive')}>
          {profile.lastActivityAt
            ? `${formatDateTimeEt(profile.lastActivityAt)} · ${relativeDays(profile.lastActivityAt)}`
            : 'Unknown'}
        </span>
      ),
    },
    {
      label: 'Last privileged review',
      value: profile.lastReviewedAt ? `${formatDate(profile.lastReviewedAt)} · ${relativeDays(profile.lastReviewedAt)}` : 'Never',
    },
    {
      label: 'Next privileged review',
      value: nextReviewValue(profile.nextPrivilegedReviewAt),
    },
    { label: 'MFA', value: profile.mfaLabel },
    {
      label: 'Owner',
      value: profile.ownerDisplayName ?? <span className="text-warning">None</span>,
    },
    { label: 'First seen by AIGIS', value: formatDate(profile.firstSeenAt) },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity and ownership</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-2.5 text-sm">
          {facts.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">{f.label}</dt>
              <dd className="min-w-0 text-pretty">{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
