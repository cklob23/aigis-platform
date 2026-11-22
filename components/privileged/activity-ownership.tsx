import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PrivilegedIdentityProfile } from '@/lib/privileged/profile'
import { formatDate, relativeDays } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ActivityOwnership({ profile }: { profile: PrivilegedIdentityProfile }) {
  const facts: { label: string; value: ReactNode }[] = [
    { label: 'Class', value: profile.classLabel },
    { label: 'Account', value: profile.accountEnabled ? 'Enabled' : <span className="text-destructive">Disabled</span> },
    {
      label: 'Last sign-in',
      value: (
        <span className={cn(!profile.lastActivityAt && 'text-destructive')}>
          {profile.lastActivityAt ? `${formatDate(profile.lastActivityAt, true)} · ${relativeDays(profile.lastActivityAt)}` : 'Unknown'}
        </span>
      ),
    },
    { label: 'Last privileged review', value: profile.lastReviewedAt ? `${formatDate(profile.lastReviewedAt)} · ${relativeDays(profile.lastReviewedAt)}` : 'Never' },
    { label: 'MFA', value: profile.mfaLabel },
    { label: 'Owner', value: profile.ownerDisplayName ?? 'None' },
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
              <dd className="min-w-0 truncate">{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
