import { Download, FileText, Globe, FolderLock, ScrollText, Users } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getDashboardData } from '@/lib/data/dashboard'
import { listDomains } from '@/lib/data/domains'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { formatDate, formatNumber } from '@/lib/format'
import { PrintButton } from '@/components/reports/print-button'

export const metadata = { title: 'Reports' }

const EXPORTS = [
  { type: 'guests', label: 'Guest inventory', description: 'Every guest with risk score, factors, sponsor, activity and review state.', icon: Users },
  { type: 'domains', label: 'External domain register', description: 'Partner organizations, classification, business owner, and exposure summary.', icon: Globe },
  { type: 'resources', label: 'Resources with external access', description: 'Teams, groups, sites and apps that include guests, with sensitivity.', icon: FolderLock },
  { type: 'audit', label: 'Audit trail', description: 'Complete administrative and remediation history with reasons.', icon: ScrollText },
]

export default async function ReportsPage() {
  const { session, tenant } = await requireOnboarded()
  const [d, domains] = await Promise.all([getDashboardData(tenant.id), listDomains(tenant.id)])
  const cur = d.current
  const canExport = can(session.role, 'export')
  const first = d.series[0]
  const unknown = domains.filter((x) => x.classification === 'unknown')

  return (
    <>
      <PageHeader
        title="Reports & exports"
        description="Evidence for SOC 2 CC6.2/CC6.3, ISO 27001 A.5.18, and HIPAA access-management reviews. Every export is itself logged."
        actions={<PrintButton />}
      />

      {!canExport && (
        <Alert>
          <AlertTitle>Exports require the Auditor role or higher</AlertTitle>
          <AlertDescription>You can read the summary below; ask an administrator for export access.</AlertDescription>
        </Alert>
      )}

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4" /> Executive summary · {tenant.display_name}
          </CardTitle>
          <CardDescription>
            Generated {formatDate(new Date().toISOString(), true)} · data as of {formatDate(cur?.date ?? tenant.last_scan_at, true)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
          {cur ? (
            <>
              <p>
                The tenant currently holds <strong>{formatNumber(cur.total_guests)}</strong> guest identities from <strong>{cur.domains}</strong> external organizations. <strong>{cur.critical}</strong> are rated critical and <strong>{cur.high}</strong> high risk;{' '}
                <strong>{cur.inactive_90}</strong> have not signed in for 90 days or more and <strong>{cur.never_signed_in}</strong> have never signed in. <strong>{cur.no_sponsor}</strong> guests lack an internal sponsor.
              </p>
              <p>
                <strong>{cur.sensitive_with_guests}</strong> resources classified as sensitive (finance, HR, executive, legal, clinical, R&amp;D) include external members. <strong>{unknown.length}</strong> domains covering {unknown.reduce((s, x) => s + x.guest_count, 0)} guests remain unclassified.
              </p>
              {first && first !== cur && (
                <p>
                  Since {formatDate(first.date)}, the guest population changed by <strong>{cur.total_guests - first.total_guests >= 0 ? '+' : ''}{cur.total_guests - first.total_guests}</strong> and the critical-risk count by{' '}
                  <strong>{cur.critical - first.critical >= 0 ? '+' : ''}{cur.critical - first.critical}</strong>. {d.pendingReviews} access review decisions are outstanding.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['External identities', cur.total_guests],
                  ['Critical', cur.critical],
                  ['High', cur.high],
                  ['Medium', cur.medium],
                  ['Low', cur.low],
                  ['Inactive 90d+', cur.inactive_90],
                  ['Pending invites', cur.pending_invites],
                  ['Disabled', cur.disabled],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">{k}</div>
                    <div className="tnum font-semibold text-xl">{formatNumber(Number(v))}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Run a scan to generate the summary.</p>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 print:hidden">
        {EXPORTS.map((e) => (
          <Card key={e.type}>
            <CardHeader className="flex-row items-start gap-3">
              <e.icon className="mt-0.5 size-5 text-primary" />
              <div className="flex flex-1 flex-col gap-1">
                <CardTitle>{e.label}</CardTitle>
                <CardDescription>{e.description}</CardDescription>
              </div>
              <Button size="sm" variant="outline" disabled={!canExport} render={canExport ? <a href={`/api/export?type=${e.type}`} /> : undefined}>
                <Download data-icon="inline-start" /> CSV
              </Button>
            </CardHeader>
          </Card>
        ))}
      </section>
    </>
  )
}
