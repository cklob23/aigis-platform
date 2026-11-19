'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/settings', label: 'General' },
  { href: '/settings/policies', label: 'Risk & policies' },
  { href: '/settings/alerts', label: 'Alert rules & email' },
  { href: '/settings/reviews', label: 'Review workflow' },
  { href: '/settings/administrators', label: 'Administrators' },
  { href: '/settings/remediation', label: 'Remediation queue' },
]

export function SettingsNav({ showPrivileged = false }: { showPrivileged?: boolean }) {
  const pathname = usePathname()
  const items = showPrivileged
    ? [ITEMS[0], { href: '/settings#privileged', label: 'Privileged access' }, ...ITEMS.slice(1)]
    : ITEMS
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((i) => {
        const active = !i.href.includes('#') && pathname === i.href
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent',
              active ? 'bg-accent font-medium' : 'text-muted-foreground',
            )}
          >
            {i.label}
          </Link>
        )
      })}
    </nav>
  )
}
