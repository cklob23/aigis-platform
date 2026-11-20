import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, ShieldOff, ClipboardCheck, Wrench } from 'lucide-react'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getGuestDetail } from '@/lib/data/guests'
import { PageHeader } from '@/components/layout/page-header'
import { RiskBadge } from '@/components/risk/risk-badge'
import { DomainClassBadge } from '@/components/domains/domain-class-badge'
import { IdentityTypeBadge, RelationshipBadge } from '@/components/organizations/org-badges'
import { RemediationDialog } from '@/components/guests/remediation-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, relativeDays, daysBetween, titleCase } from '@/lib/format'
import { RESOURCE_TYPE_LABELS } from '@/lib/types'
import { describeRecommendation } from '@/lib/risk/recommendation'
import { describeOwner } from '@/lib/identity/owner'
import { parseAiSettings } from '@/lib/ai/recommend'
import { ExplainRecommendation } from '@/components/guests/explain-recommendation'
import { OwnerFact } from '@/components/guests/owner-fact'
import { cn } from '@/lib/utils'

export default async function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { session, tenant } = await requireOnboarded()
  const data = await getGuestDetail(tenant.id, id)
  if (!data) notFound()
  const { guest: g, identity, ownerGuest, memberships, activity, history, reviews, remediations, domain, organization, explanation } = data
  const aiEnabled = parseAiSettings(tenant.settings).enabled
  const owner = describeOwner(
    identity ?? {
      owner_kind: g.sponsor_ms_object_id || g.sponsor_email ? 'sponsor' : 'none',
      owner_identity_id: null,
      owner_display_name: g.sponsor_display_name,
      owner_email: g.sponsor_email,
      owner_ms_object_id: g.sponsor_ms_object_id,
    },
    ownerGuest,
  )
  const sensitive = memberships.filter((m) => m.resource.is_sensitive)
  const factors = [...g.risk_factors].sort((a, b) => b.points - a.points)
  const recommendation = describeRecommendation(g)
  const evidence = Array.isArray(g.classification_evidence) ? g.classification_evidence : []
  const canRemediate = can(session.role, 'remediation.request') && !g.removed_at

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Email', value: <span className="font-mono">{g.email ?? '—'}</span> },
    { label: 'UPN', value: <span className="truncate font-mono text-xs">{g.upn ?? '—'}</span> },
    { label: 'Company', value: g.company_name ?? '—' },
    { label: 'Account', value: g.account_enabled ? 'Enabled' : <span className="text-destructive">Disabled</span> },
    { label: 'Invitation', value: g.invitation_status === 'PendingAcceptance' ? <span className="text-warning">Pending acceptance</span> : 'Accepted' },
    { label: 'Created', value: `${formatDate(g.created_at_ms)} (${daysBetween(g.created_at_ms) ?? '?'}d)` },
    { label: 'Last sign-in', value: <span className={cn(!g.last_sign_in_at && 'text-destructive')}>{g.last_sign_in_at ? `${formatDate(g.last_sign_in_at, true)} · ${relativeDays(g.last_sign_in_at)}` : 'Never'}</span> },
    { label: 'Non-interactive', value: relativeDays(g.last_non_interactive_sign_in_at) },
    { label: 'Auth methods', value: g.auth_methods.length ? g.auth_methods.map((m) => titleCase(m.replace('AuthenticationMethod', ''))).join(', ') : <span className="text-muted-foreground">None registered</span> },
    {
      label: 'Owner',
      value: <OwnerFact owner={owner} sponsorEnabled={g.sponsor_enabled} />,
    },
    { label: 'Review status', value: <span className="capitalize">{titleCase(g.review_status)}{g.last_reviewed_at && <span className="ml-1 text-muted-foreground">· {relativeDays(g.last_reviewed_at)}</span>}</span> },
    { label: 'First seen by AIGIS', value: formatDate(g.first_seen_at) },
  ]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/guests" />}>
          <ArrowLeft data-icon="inline-start" /> External identities
        </Button>
      </div>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            {organization && (
              <>
                <Link href={`/organizations/${organization.id}`} className="font-medium text-foreground hover:underline">
                  {organization.name}
                </Link>
                <RelationshipBadge value={organization.relationship_type} />
                <span className="text-muted-foreground">·</span>
              </>
            )}
            <Link href={`/domains/${encodeURIComponent(g.domain ?? '')}`} className="font-mono hover:underline">
              {g.domain}
            </Link>
            {domain && !organization && <DomainClassBadge classification={domain.classification} />}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {g.display_name ?? g.email}
            <IdentityTypeBadge value={g.external_type} className="text-sm" />
            <RiskBadge level={g.risk_level} score={g.risk_score} className="text-sm" />
            {g.removed_at && <Badge variant="destructive">Removed {relativeDays(g.removed_at)}</Badge>}
          </span>
        }
        description={
          <span className="flex flex-col gap-0.5">
            <span>
              Recommended action: <span className="font-medium text-foreground">{recommendation.label}</span>
              {recommendation.label !== 'Keep' && <span className="text-muted-foreground"> — {recommendation.reason}</span>}
            </span>
            <span>
              {memberships.length} resource memberships, {sensitive.length} sensitive.
            </span>
          </span>
        }
        actions={
          canRemediate ? (
            <RemediationDialog
              guest={g}
              memberships={memberships}
              canExecute={can(session.role, 'remediation.execute')}
              isDemo={tenant.is_demo}
              monitorOnly={!tenant.is_demo && tenant.settings.enforcement_mode !== 'enforce'}
              trigger={
                <Button variant={g.risk_level === 'critical' ? 'destructive' : 'default'}>
                  <Wrench data-icon="inline-start" /> Remediate
                </Button>
              }
            />
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Why this score</CardTitle>
            <CardDescription>Each factor adds points; the total is capped at 100. Thresholds are configurable in Settings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {factors.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="tnum w-10 text-right font-mono text-sm">+{f.points}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', f.points >= 25 ? 'bg-destructive' : f.points >= 12 ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, f.points * 3)}%` }} />
                </div>
                <div className="flex w-1/2 min-w-0 flex-col">
                  <span className="truncate text-sm">{f.label}</span>
                  {f.detail && <span className="truncate text-muted-foreground text-xs">{f.detail}</span>}
                </div>
              </div>
            ))}
            {factors.length === 0 && <p className="text-muted-foreground text-sm">No risk factors. This identity looks healthy.</p>}
            <ExplainRecommendation
              guestId={g.id}
              enabled={aiEnabled}
              initial={explanation ? { explanation: explanation.explanation as string, created_at: explanation.created_at as string } : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2.5 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground text-xs">{f.label}</dt>
                  <dd className="min-w-0 truncate">{f.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Why this is classified as <IdentityTypeBadge value={g.external_type} />
          </CardTitle>
          <CardDescription>
            Signals observed on the last scan, strongest first. Changing the owning organization&apos;s relationship type re-runs classification for every identity in it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {evidence.map((e, i) => (
            <div key={`${e.signal}-${i}`} className="flex items-start gap-3 text-sm">
              <span className={cn('tnum w-8 shrink-0 text-right font-mono', e.weight === 0 ? 'text-muted-foreground' : '')}>{e.weight > 0 ? `+${e.weight}` : '·'}</span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{e.signal}</span>
                  {e.value && <span className="truncate font-mono text-xs">{e.value}</span>}
                </span>
                <span className="text-pretty">{e.explanation}</span>
              </div>
            </div>
          ))}
          {evidence.length === 0 && <p className="text-muted-foreground text-sm">No classification evidence yet. Run a scan to classify this identity.</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="access">
        <TabsList>
          <TabsTrigger value="access">Access ({memberships.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({activity.length})</TabsTrigger>
          <TabsTrigger value="history">Score history ({history.length})</TabsTrigger>
          <TabsTrigger value="governance">Reviews & remediation ({reviews.length + remediations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="access">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead className="hidden md:table-cell">Members</TableHead>
                  <TableHead className="hidden md:table-cell">Since</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/resources/${m.resource.id}`} className="font-medium hover:underline">
                        {m.resource.display_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{RESOURCE_TYPE_LABELS[m.resource.resource_type]}</TableCell>
                    <TableCell className="text-xs capitalize">{m.membership_type}</TableCell>
                    <TableCell>
                      {m.resource.is_sensitive ? (
                        <Badge variant="outline" className="border-warning/50 text-warning capitalize">
                          {m.resource.sensitivity_category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Standard</span>
                      )}
                    </TableCell>
                    <TableCell className="tnum hidden font-mono text-xs md:table-cell">
                      {m.resource.internal_member_count} int · {m.resource.external_member_count} ext
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{formatDate(m.first_seen_at)}</TableCell>
                    <TableCell>
                      {m.resource.web_url && (
                        <a href={m.resource.web_url} target="_blank" rel="noreferrer" aria-label="Open resource" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {memberships.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      <ShieldOff className="mx-auto mb-1 size-4" /> No current resource access.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <ol className="flex flex-col divide-y rounded-lg border">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-32 shrink-0 font-mono text-muted-foreground text-xs">{formatDate(a.occurred_at, true)}</span>
                <span className="font-medium capitalize">{titleCase(a.activity_type)}</span>
                <span className="truncate text-muted-foreground text-xs">{Object.entries(a.details ?? {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ')}</span>
              </li>
            ))}
            {activity.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">No activity recorded yet.</li>}
          </ol>
        </TabsContent>

        <TabsContent value="history">
          <div className="flex flex-col gap-1 rounded-lg border p-4">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 font-mono text-muted-foreground text-xs">{formatDate(h.calculated_at, true)}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full', h.level === 'critical' ? 'bg-destructive' : h.level === 'high' ? 'bg-warning' : 'bg-primary')} style={{ width: `${h.score}%` }} />
                </div>
                <RiskBadge level={h.level} score={h.score} />
              </div>
            ))}
            {history.length === 0 && <p className="text-muted-foreground text-sm">No scoring history yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="governance">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="size-4" /> Access reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {reviews.map((r) => {
                  const review = r.review as unknown as { id: string; name: string; status: string; due_at: string | null }
                  return (
                    <Link key={r.id} href={`/reviews/${review.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:underline">
                      <span className="truncate">{review.name}</span>
                      <Badge variant="outline" className="capitalize">
                        {r.decision ?? r.status}
                      </Badge>
                    </Link>
                  )
                })}
                {reviews.length === 0 && <p className="text-muted-foreground text-sm">Never included in a review.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="size-4" /> Remediation history
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col divide-y">
                {remediations.map((r) => (
                  <div key={r.id} className="flex flex-col gap-0.5 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="capitalize">{titleCase(r.action_type)}</span>
                      <Badge variant="outline" className={cn('capitalize', r.status === 'completed' && 'border-success/40 text-success', r.status === 'failed' && 'border-destructive/40 text-destructive', r.status === 'pending' && 'border-warning/40 text-warning')}>
                        {r.status}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {formatDate(r.created_at, true)} · {r.reason}
                    </span>
                  </div>
                ))}
                {remediations.length === 0 && <p className="text-muted-foreground text-sm">No remediation actions.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </>
  )
}
