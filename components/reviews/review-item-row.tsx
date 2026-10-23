'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, X, Clock, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { RiskBadge } from '@/components/risk/risk-badge'
import { decideReviewItem } from '@/lib/actions/governance'
import { relativeDays } from '@/lib/format'
import type { Guest, ReviewItem } from '@/lib/types'
import { cn } from '@/lib/utils'

const DECISIONS = [
  { key: 'approve', label: 'Approve', icon: Check, className: 'hover:bg-success/15 hover:text-success data-[active=true]:bg-success/15 data-[active=true]:text-success' },
  { key: 'extend', label: 'Extend 90d', icon: Clock, className: 'hover:bg-primary/15 hover:text-primary data-[active=true]:bg-primary/15 data-[active=true]:text-primary' },
  { key: 'investigate', label: 'Investigate', icon: Search, className: 'hover:bg-warning/15 hover:text-warning data-[active=true]:bg-warning/15 data-[active=true]:text-warning' },
  { key: 'remove', label: 'Remove', icon: X, className: 'hover:bg-destructive/15 hover:text-destructive data-[active=true]:bg-destructive/15 data-[active=true]:text-destructive' },
] as const

export function ReviewItemRow({ item, canDecide, readOnly }: { item: ReviewItem & { guest: Guest }; canDecide: boolean; readOnly: boolean }) {
  const [comment, setComment] = useState('')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const g = item.guest
  const decided = item.status !== 'pending'

  const decide = (decision: (typeof DECISIONS)[number]['key']) => {
    startTransition(async () => {
      const res = await decideReviewItem({ itemId: item.id, decision, comment })
      if (res.ok) {
        toast.success(`${g.display_name ?? g.email}: ${decision}`)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  return (
    <li className={cn('flex flex-col gap-3 p-4 lg:flex-row lg:items-start', decided && 'bg-muted/20')}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/guests/${g.id}`} className="font-medium hover:underline">
            {g.display_name ?? g.email}
          </Link>
          <RiskBadge level={g.risk_level} score={g.risk_score} />
          <span className="font-mono text-muted-foreground text-xs">{g.domain}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span>Last sign-in {relativeDays(g.last_sign_in_at).toLowerCase()}</span>
          <span>Sponsor {g.sponsor_display_name ?? 'none'}</span>
          <span>Recommendation: {g.recommended_action.replace('_', ' ')}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {item.resources_snapshot.slice(0, 6).map((r) => (
            <Badge key={r.id} variant="outline" className={cn('font-normal', r.sensitive && 'border-warning/50 text-warning')}>
              {r.name}
            </Badge>
          ))}
          {item.resources_snapshot.length > 6 && <span className="text-muted-foreground text-xs">+{item.resources_snapshot.length - 6} more</span>}
          {item.resources_snapshot.length === 0 && <span className="text-muted-foreground text-xs">No resource access at snapshot time</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2 lg:w-96">
        {decided ? (
          <div className="flex items-center gap-2 text-sm">
            <Badge className={cn('capitalize', item.decision === 'approve' && 'bg-success/15 text-success', item.decision === 'remove' && 'bg-destructive/15 text-destructive', item.decision === 'extend' && 'bg-primary/15 text-primary', item.decision === 'investigate' && 'bg-warning/15 text-warning')}>
              {item.decision}
            </Badge>
            <span className="text-muted-foreground text-xs">decided {relativeDays(item.decided_at).toLowerCase()}</span>
          </div>
        ) : canDecide && !readOnly ? (
          <>
            <div className="grid grid-cols-4 gap-1">
              {DECISIONS.map((d) => (
                <Button key={d.key} size="sm" variant="outline" disabled={pending} onClick={() => decide(d.key)} className={cn('flex-col gap-0.5 py-1 h-auto text-[11px]', d.className)}>
                  <d.icon className="size-3.5" />
                  {d.label}
                </Button>
              ))}
            </div>
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment for the audit trail" className="h-8 text-xs" />
          </>
        ) : (
          <span className="text-muted-foreground text-xs">Awaiting decision</span>
        )}
      </div>
    </li>
  )
}
