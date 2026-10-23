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

export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((i) => (
        <Link key={i.href} href={i.href} className={cn('whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent', pathname === i.href ? 'bg-accent font-medium' : 'text-muted-foreground')}>
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
