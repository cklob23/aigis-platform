import Link from 'next/link'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listRemediations } from '@/lib/data/governance'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApproveRemediationButton } from '@/components/settings/approve-remediation-button'
import { formatDate, titleCase } from '@/lib/format'
import { cn } from '@/lib/utils'

export default async function RemediationQueuePage() {
  const { session, tenant } = await requireOnboarded()
  const actions = await listRemediations(tenant.id)
  const canExecute = can(session.role, 'remediation.execute')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Remediation queue</CardTitle>
        <CardDescription>Requests from analysts await administrator approval. Executed actions are listed with their Graph results.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {actions.map((a) => {
          const guest = a.guest as unknown as { id: string; display_name: string | null; email: string | null; domain: string | null } | null
          const targets = (a.target_resources as { name: string }[]) ?? []
          return (
            <div key={a.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{titleCase(a.action_type)}</span>
                  {guest && (
                    <Link href={`/guests/${guest.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                      {guest.email ?? guest.display_name}
                    </Link>
                  )}
                  <Badge variant="outline" className={cn('capitalize', a.status === 'completed' && 'border-success/40 text-success', a.status === 'failed' && 'border-destructive/40 text-destructive', a.status === 'pending' && 'border-warning/40 text-warning')}>
                    {a.status}
                  </Badge>
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(a.created_at, true)} · {targets.length} target{targets.length === 1 ? '' : 's'} · {a.reason}
                  {a.correlation_id && <span className="ml-1 font-mono">#{a.correlation_id}</span>}
                </span>
              </div>
              {a.status === 'pending' && canExecute && <ApproveRemediationButton actionId={a.id} />}
            </div>
          )
        })}
        {actions.length === 0 && <p className="text-muted-foreground text-sm">No remediation actions yet.</p>}
      </CardContent>
    </Card>
  )
}
