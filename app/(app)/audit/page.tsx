import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { listAudit } from '@/lib/data/governance'
import { PageHeader } from '@/components/layout/page-header'
import { Pagination } from '@/components/layout/pagination'
import { AuditTable } from '@/components/audit/audit-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Audit log' }

const CATEGORIES = ['all', 'auth', 'tenant', 'scan', 'domain', 'review', 'remediation', 'policy', 'admin', 'settings', 'ai', 'report']

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; action?: string; page?: string }> }) {
  const sp = await searchParams
  const { session, tenant } = await requireOnboarded()
  if (!can(session.role, 'audit.view')) {
    return (
      <PageHeader
        title="Audit log"
        description="Your role cannot view the audit log. Ask an administrator to grant Auditor or above."
      />
    )
  }
  const { events, total, page, size } = await listAudit(tenant.id, { q: sp.q, action: sp.action, page: Number(sp.page ?? 1) })

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Immutable record of every administrative action, scan, decision, and remediation — who, what, when, from where, and why. Select a row to see the full change."
        actions={
          can(session.role, 'export') ? (
            <Button variant="outline" nativeButton={false} render={<a href="/api/export?type=audit" />}>
              <Download data-icon="inline-start" /> Export CSV
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2">
          <Input name="q" defaultValue={sp.q ?? ''} placeholder="Search actor, target, action…" className="h-8 w-64 text-sm" aria-label="Search audit log" />
          {sp.action && <input type="hidden" name="action" value={sp.action} />}
          <Button size="sm" variant="secondary" type="submit">
            Search
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Link key={c} href={c === 'all' ? `/audit${sp.q ? `?q=${sp.q}` : ''}` : `/audit?action=${c}${sp.q ? `&q=${sp.q}` : ''}`} className={cn('rounded-md border px-2 py-1 text-xs capitalize transition-colors hover:bg-accent', (sp.action ?? 'all') === c ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground')}>
              {c}
            </Link>
          ))}
        </div>
      </div>

      <AuditTable events={events} />
      <Pagination page={page} pageSize={size} total={total} basePath="/audit" params={sp} />
    </>
  )
}
