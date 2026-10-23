import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { APPROVAL_LABELS, EXTERNAL_TYPE_LABELS, RELATIONSHIP_LABELS, type ApprovalState, type ExternalIdentityType, type RelationshipType } from '@/lib/types'

const RELATIONSHIP_STYLES: Record<RelationshipType, string> = {
  partner: 'border-success/40 text-success',
  client: 'border-success/40 text-success',
  vendor: 'border-primary/40 text-primary',
  contractor: 'border-primary/40 text-primary',
  temporary: 'border-warning/50 text-warning',
  unknown: 'border-border text-muted-foreground',
  former: 'border-destructive/40 text-destructive',
  blocked: 'border-destructive/40 text-destructive',
}

const APPROVAL_STYLES: Record<ApprovalState, string> = {
  approved: 'bg-success/10 text-success border-transparent',
  unreviewed: 'bg-muted text-muted-foreground border-transparent',
  restricted: 'bg-warning/10 text-warning border-transparent',
  blocked: 'bg-destructive/10 text-destructive border-transparent',
}

export function RelationshipBadge({ value, className }: { value: RelationshipType; className?: string }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 font-normal', RELATIONSHIP_STYLES[value] ?? RELATIONSHIP_STYLES.unknown, className)}>
      {RELATIONSHIP_LABELS[value] ?? value}
    </Badge>
  )
}

export function ApprovalBadge({ value, className }: { value: ApprovalState; className?: string }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 font-normal', APPROVAL_STYLES[value] ?? APPROVAL_STYLES.unreviewed, className)}>
      {APPROVAL_LABELS[value] ?? value}
    </Badge>
  )
}

export function IdentityTypeBadge({ value, className }: { value: ExternalIdentityType; className?: string }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 font-normal', value === 'unknown' ? 'text-muted-foreground' : '', className)}>
      {EXTERNAL_TYPE_LABELS[value] ?? value}
    </Badge>
  )
}
