import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const href = (p: number) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') sp.set(k, v)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <span className="tnum text-muted-foreground">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} aria-label="Previous page" nativeButton={page <= 1} render={page > 1 ? <Link href={href(page - 1)} /> : undefined}>
          <ChevronLeft />
        </Button>
        <span className="tnum px-2 font-mono text-xs">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} aria-label="Next page" nativeButton={page >= pages} render={page < pages ? <Link href={href(page + 1)} /> : undefined}>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}
