import { Wrench } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { REMEDIATION_PLACEHOLDER } from '@/lib/privileged/copy'

export function RemediationPlaceholder() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Wrench />
        </EmptyMedia>
        <EmptyTitle>Remediation coming later</EmptyTitle>
        <EmptyDescription>{REMEDIATION_PLACEHOLDER}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
