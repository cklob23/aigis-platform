import { cn } from '@/lib/utils'
import { TIER_LABEL } from '@/lib/privileged/view'

const TIER_PILL: Record<0 | 1 | 2, string> = {
  0: 'bg-[#FEE2E2] text-[#B91C1C]',
  1: 'bg-[#FEF3C7] text-[#B45309]',
  2: 'bg-[#F1F5F9] text-[#475569]',
}

export function TierBadge({ tier, className }: { tier: 0 | 1 | 2 | null; className?: string }) {
  if (tier !== 0 && tier !== 1 && tier !== 2) return null
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center rounded px-1 text-[10px] font-medium tracking-wide',
        TIER_PILL[tier],
        className,
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  )
}
