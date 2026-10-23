import Image from 'next/image'
import { cn } from '@/lib/utils'

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Mark />
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-semibold text-sm tracking-[0.18em]">AIGIS</span>
          <span className="mt-1 text-[10px] text-muted-foreground tracking-wide">Access · Identity · Governance</span>
        </div>
      )}
    </div>
  )
}

export function Mark({ className }: { className?: string }) {
  return <Image src="/icon-192x192.png" alt="" width={32} height={32} priority className={cn('size-8 shrink-0 rounded-md', className)} aria-hidden="true" />
}
