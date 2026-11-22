import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { PRIVILEGED_DETAIL_DENIED } from '@/lib/privileged/copy'

export function PrivilegedDetailDenied() {
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/privileged" />}>
          <ArrowLeft data-icon="inline-start" /> Privileged access
        </Button>
      </div>
      <PageHeader title="Privileged identity" description={PRIVILEGED_DETAIL_DENIED} />
    </>
  )
}
