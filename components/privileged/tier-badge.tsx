import { Badge } from '@/components/ui/badge'
import { TIER_LABEL } from '@/lib/privileged/view'

export function TierBadge({ tier }: { tier: 0 | 1 | 2 | null }) {
  if (tier !== 0 && tier !== 1 && tier !== 2) return null
  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px]">
      {TIER_LABEL[tier]}
    </Badge>
  )
}
