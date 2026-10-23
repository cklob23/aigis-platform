'use client'

import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate } from '@/lib/format'
import type { AuditEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

function pretty(value: unknown) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Flat key-by-key diff when both sides are plain objects; otherwise callers fall back to raw JSON. */
function diffKeys(prev: unknown, next: unknown) {
  if (!isRecord(prev) && !isRecord(next)) return null
  const p = isRecord(prev) ? prev : {}
  const n = isRecord(next) ? next : {}
  const keys = Array.from(new Set([...Object.keys(p), ...Object.keys(n)]))
  return keys.map((k) => ({ key: k, before: p[k], after: n[k], changed: JSON.stringify(p[k]) !== JSON.stringify(n[k]) }))
}

function Value({ v }: { v: unknown }) {
  if (v === undefined || v === null || v === '') return <span className="text-muted-foreground">—</span>
  if (typeof v === 'object') return <pre className="whitespace-pre-wrap break-all font-mono text-xs">{JSON.stringify(v, null, 2)}</pre>
  return <span className="break-all font-mono text-xs">{String(v)}</span>
}

export function AuditTable({ events }: { events: AuditEvent[] }) {
  const [active, setActive] = useState<AuditEvent | null>(null)
  const diff = active ? diffKeys(active.previous_state, active.new_state) : null

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="hidden lg:table-cell">Change</TableHead>
              <TableHead className="hidden xl:table-cell">Reason</TableHead>
              <TableHead className="hidden xl:table-cell">Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((e) => (
              <TableRow
                key={e.id}
                tabIndex={0}
                role="button"
                aria-label={`Open details for ${e.action} on ${e.target_label ?? e.target_id ?? 'event'}`}
                onClick={() => setActive(e)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setActive(e)
                  }
                }}
                className="cursor-pointer outline-none focus-visible:bg-accent/60"
              >
                <TableCell className="whitespace-nowrap font-mono text-xs">{formatDate(e.created_at, true)}</TableCell>
                <TableCell className="max-w-40 truncate font-mono text-xs">{e.actor_email}</TableCell>
                <TableCell>
                  <code className={cn('rounded bg-muted px-1.5 py-0.5 text-xs', e.action.startsWith('remediation') && 'bg-destructive/10 text-destructive', e.action.startsWith('review') && 'bg-primary/10 text-primary')}>{e.action}</code>
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs">
                  {e.target_type && <span className="text-muted-foreground">{e.target_type} · </span>}
                  {e.target_label ?? e.target_id ?? '—'}
                </TableCell>
                <TableCell className="hidden max-w-72 lg:table-cell">
                  {Boolean(e.previous_state || e.new_state) && (
                    <span className="block truncate font-mono text-muted-foreground text-[11px]">
                      {e.previous_state ? `${JSON.stringify(e.previous_state)} → ` : ''}
                      {JSON.stringify(e.new_state ?? {})}
                    </span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-56 truncate text-xs xl:table-cell">{e.reason ?? ''}</TableCell>
                <TableCell className="hidden font-mono text-muted-foreground text-xs xl:table-cell">{e.source_ip ?? ''}</TableCell>
              </TableRow>
            ))}
            {events.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No audit events match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={Boolean(active)} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
          {active && (
            <>
              <SheetHeader className="border-b">
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  <code className={cn('rounded bg-muted px-1.5 py-0.5 text-sm', active.action.startsWith('remediation') && 'bg-destructive/10 text-destructive', active.action.startsWith('review') && 'bg-primary/10 text-primary')}>{active.action}</code>
                </SheetTitle>
                <SheetDescription>
                  {formatDate(active.created_at, true)} · {active.actor_email ?? 'system'}
                </SheetDescription>
              </SheetHeader>

              <div className="flex flex-col gap-5 p-4">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground text-xs">Target</dt>
                  <dd className="min-w-0">
                    {active.target_type && <span className="text-muted-foreground">{active.target_type} · </span>}
                    {active.target_label ?? '—'}
                    {active.target_id && <span className="block break-all font-mono text-muted-foreground text-xs">{active.target_id}</span>}
                  </dd>
                  <dt className="text-muted-foreground text-xs">Reason</dt>
                  <dd className="min-w-0 text-pretty">{active.reason ?? <span className="text-muted-foreground">Not provided</span>}</dd>
                  <dt className="text-muted-foreground text-xs">Source IP</dt>
                  <dd className="font-mono text-xs">{active.source_ip ?? <span className="text-muted-foreground">—</span>}</dd>
                  <dt className="text-muted-foreground text-xs">Correlation</dt>
                  <dd className="font-mono text-xs">{active.correlation_id ?? <span className="text-muted-foreground">—</span>}</dd>
                  <dt className="text-muted-foreground text-xs">Event ID</dt>
                  <dd className="break-all font-mono text-xs">{active.id}</dd>
                </dl>

                <section aria-labelledby="audit-change" className="flex flex-col gap-2">
                  <h3 id="audit-change" className="font-medium text-sm">
                    Change
                  </h3>
                  {diff && diff.length > 0 ? (
                    <div className="overflow-hidden rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-muted-foreground text-xs">
                          <tr>
                            <th className="px-3 py-1.5 text-left font-medium">Field</th>
                            <th className="px-3 py-1.5 text-left font-medium">Before</th>
                            <th className="px-3 py-1.5 text-left font-medium">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {diff.map((row) => (
                            <tr key={row.key} className={cn(row.changed && 'bg-warning/5')}>
                              <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs">{row.key}</td>
                              <td className="px-3 py-2 align-top">
                                <Value v={row.before} />
                              </td>
                              <td className={cn('px-3 py-2 align-top', row.changed && 'font-medium')}>
                                <Value v={row.after} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : active.previous_state || active.new_state ? (
                    <div className="grid gap-3">
                      {active.previous_state !== null && active.previous_state !== undefined && (
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs">Before</span>
                          <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">{pretty(active.previous_state)}</pre>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs">After</span>
                        <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs">{pretty(active.new_state) ?? '—'}</pre>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">This event did not record a state change.</p>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
