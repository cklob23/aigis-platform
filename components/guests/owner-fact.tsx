import Link from 'next/link'
import type { OwnerView } from '@/lib/identity/owner'
import { cn } from '@/lib/utils'

export const INTERNAL_CHIP_TITLE = "Internal user in this tenant's inventory"
export const UNRESOLVED_CHIP_TITLE = 'Sponsor not found in the last scan'

const CHIP =
  'ml-1.5 inline-flex align-middle rounded-full border px-1.5 text-[10px] font-medium'

function OwnerChip({ owner }: { owner: OwnerView }) {
  if (owner.internal) {
    return (
      <span className={cn(CHIP, 'border-border text-muted-foreground')} title={INTERNAL_CHIP_TITLE}>
        Internal
      </span>
    )
  }
  if (!owner.resolved && owner.kind === 'sponsor') {
    return (
      <span className={cn(CHIP, 'border-warning/30 bg-warning/10 text-warning')} title={UNRESOLVED_CHIP_TITLE}>
        Not in inventory
      </span>
    )
  }
  return null
}

export function OwnerFact({
  owner,
  sponsorEnabled,
}: {
  owner: OwnerView
  sponsorEnabled?: boolean | null
}) {
  if (owner.kind === 'none') return <span className="text-destructive">None</span>
  const showEmail = Boolean(owner.email && owner.email !== owner.label)
  return (
    <span className={cn(sponsorEnabled === false && 'text-warning')}>
      <span className="block font-medium">
        {owner.href ? (
          <Link href={owner.href} className="hover:underline">
            {owner.label}
          </Link>
        ) : (
          owner.label
        )}
        <OwnerChip owner={owner} />
      </span>
      {showEmail ? <span className="block font-mono text-muted-foreground text-xs">{owner.email}</span> : null}
      {sponsorEnabled === false ? <span className="block text-xs">Sponsor account is disabled</span> : null}
    </span>
  )
}
