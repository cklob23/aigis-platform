'use client'

import { useCallback, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DOMAIN_CLASSIFICATION_LABELS } from '@/lib/types'

type Option = { value: string; label: string }

const RISK: Option[] = [
  { value: 'all', label: 'All risk levels' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]
const STATUS: Option[] = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Invitation pending' },
  { value: 'disabled', label: 'Disabled' },
]
const ACTIVITY: Option[] = [
  { value: 'all', label: 'Any activity' },
  { value: 'inactive90', label: 'Inactive 90+ days' },
  { value: 'inactive180', label: 'Inactive 180+ days' },
  { value: 'never', label: 'Never signed in' },
]
const SPONSOR: Option[] = [
  { value: 'all', label: 'Any sponsor' },
  { value: 'none', label: 'No sponsor' },
  { value: 'disabled', label: 'Sponsor disabled' },
]
const REVIEW: Option[] = [
  { value: 'all', label: 'Any review state' },
  { value: 'never_reviewed', label: 'Never reviewed' },
  { value: 'pending', label: 'Review pending' },
]
const SORT: Option[] = [
  { value: 'risk', label: 'Sort: risk' },
  { value: 'name', label: 'Sort: name' },
  { value: 'last_sign_in', label: 'Sort: last sign-in' },
  { value: 'created', label: 'Sort: newest' },
]

export function GuestFilters({ domains }: { domains: { domain: string; classification: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  const set = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (!value || value === 'all') next.delete(key)
      else next.set(key, value)
      next.delete('page')
      startTransition(() => router.replace(`${pathname}?${next.toString()}`))
    },
    [params, pathname, router],
  )

  const select = (key: string, options: Option[], widthClass = 'w-40') => (
    <Select
      items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
      value={params.get(key) ?? options[0].value}
      onValueChange={(v) => set(key, v as string)}
    >
      <SelectTrigger size="sm" className={widthClass} aria-label={options[0].label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const active = ['risk', 'status', 'activity', 'sponsor', 'review', 'domain', 'q', 'action', 'cause'].filter((k) => params.get(k))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault()
          set('q', new FormData(e.currentTarget).get('q') as string)
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={params.get('q') ?? ''} placeholder="Search name, email, domain…" className="h-8 w-60 pl-8 text-sm" aria-label="Search guests" />
      </form>
      {select('risk', RISK, 'w-36')}
      {select('activity', ACTIVITY, 'w-40')}
      {select('status', STATUS, 'w-36')}
      {select('sponsor', SPONSOR, 'w-36')}
      {select('review', REVIEW, 'w-40')}
      <Select
        items={{ all: 'All domains', ...Object.fromEntries(domains.map((d) => [d.domain, d.domain])) }}
        value={params.get('domain') ?? 'all'}
        onValueChange={(v) => set('domain', v as string)}
      >
        <SelectTrigger size="sm" className="w-48" aria-label="Domain">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All domains</SelectItem>
          {domains.map((d) => (
            <SelectItem key={d.domain} value={d.domain}>
              <span className="font-mono text-xs">{d.domain}</span>
              <span className="ml-2 text-muted-foreground text-xs">{DOMAIN_CLASSIFICATION_LABELS[d.classification as keyof typeof DOMAIN_CLASSIFICATION_LABELS]}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-2">
        {active.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => startTransition(() => router.replace(pathname))}>
            <X data-icon="inline-start" /> Clear {active.length}
          </Button>
        )}
        {select('sort', SORT, 'w-40')}
      </div>
    </div>
  )
}
