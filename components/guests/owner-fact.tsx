import Link from 'next/link'
import { ownerKindLabel, type OwnerView } from '@/lib/identity/owner'
import { cn } from '@/lib/utils'

export function OwnerFact({
  owner,
  sponsorEnabled,
}: {
  owner: OwnerView
  sponsorEnabled?: boolean | null
}) {
  if (owner.kind === 'none') return <span className="text-destructive">None</span>
  return (
    <span className={cn(sponsorEnabled === false && 'text-warning')}>
      <span className="text-muted-foreground text-xs">{ownerKindLabel(owner.kind)}</span>
      {owner.href ? (
        <Link href={owner.href} className="block font-medium hover:underline">
          {owner.label}
        </Link>
      ) : (
        <span className="block font-medium">
          {owner.label}
          {owner.internal ? (
            <span className="ml-1.5 inline-flex align-middle rounded-full border border-border px-1.5 text-[10px] font-medium text-muted-foreground">
              Internal
            </span>
          ) : null}
        </span>
      )}
      {owner.email ? <span className="block font-mono text-muted-foreground text-xs">{owner.email}</span> : null}
      {sponsorEnabled === false ? <span className="block text-xs">Sponsor account is disabled</span> : null}
      {!owner.resolved && owner.kind === 'sponsor' ? (
        <span className="block text-muted-foreground text-xs">Not in inventory</span>
      ) : null}
    </span>
  )
}
