import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { DOMAIN_CLASSIFICATION_LABELS, type DomainClassification } from '@/lib/types'

const STYLES: Record<DomainClassification, string> = {
  approved_partner: 'border-success/40 text-success',
  client: 'border-success/40 text-success',
  vendor: 'border-primary/40 text-primary',
  contractor: 'border-primary/40 text-primary',
  temporary: 'border-warning/50 text-warning',
  unknown: 'border-border text-muted-foreground',
  blocked: 'border-destructive/40 text-destructive',
}

export function DomainClassBadge({ classification, className }: { classification: DomainClassification; className?: string }) {
  return (
    <Badge variant="outline" className={cn('shrink-0 font-normal', STYLES[classification] ?? STYLES.unknown, className)}>
      {DOMAIN_CLASSIFICATION_LABELS[classification] ?? classification}
    </Badge>
  )
}
