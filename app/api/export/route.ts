import { NextResponse, type NextRequest } from 'next/server'
import { getSession, getTenant, withLiveRole } from '@/lib/auth/current'
import { can, canExportPrivileged } from '@/lib/auth/rbac'
import { privilegedPagesEnabled } from '@/lib/privileged/capability'
import { getPrivilegedDetail } from '@/lib/data/privileged'
import { ASSIGNMENT_STATE_LABEL, IDENTITY_CLASS_LABEL, TIER_LABEL } from '@/lib/privileged/view'
import { listGuests, type GuestFilters } from '@/lib/data/guests'
import { listDomains } from '@/lib/data/domains'
import { listOrganizations } from '@/lib/data/organizations'
import { listResources } from '@/lib/data/resources'
import { listAudit } from '@/lib/data/governance'
import { audit } from '@/lib/audit'
import { formatDate } from '@/lib/format'

function csv(rows: (string | number | null | undefined | boolean)[][]) {
  return rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}

export async function GET(req: NextRequest) {
  const raw = await getSession()
  if (!raw) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const session = await withLiveRole(raw)
  if (!session) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!can(session.role, 'export')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const tenant = await getTenant(session.tenantId)
  if (!tenant) return NextResponse.json({ error: 'tenant_missing' }, { status: 404 })
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? 'guests'
  let body = ''
  let name = type

  if (type === 'guests') {
    const f: GuestFilters = {
      q: sp.get('q') ?? undefined,
      risk: (sp.get('risk') as GuestFilters['risk']) ?? undefined,
      domain: sp.get('domain') ?? undefined,
      organization: sp.get('organization') ?? undefined,
      status: (sp.get('status') as GuestFilters['status']) ?? undefined,
      activity: (sp.get('activity') as GuestFilters['activity']) ?? undefined,
      sponsor: (sp.get('sponsor') as GuestFilters['sponsor']) ?? undefined,
      review: (sp.get('review') as GuestFilters['review']) ?? undefined,
      sort: (sp.get('sort') as GuestFilters['sort']) ?? undefined,
      page: 1,
      pageSize: 200,
    }
    const all: Awaited<ReturnType<typeof listGuests>>['guests'] = []
    for (let page = 1; page <= 50; page++) {
      const res = await listGuests(tenant.id, { ...f, page })
      all.push(...res.guests)
      if (all.length >= res.total) break
    }
    body = csv([
      ['Display name', 'Email', 'Domain', 'Company', 'Identity type', 'Account enabled', 'Invitation', 'Created', 'Last sign-in', 'Sponsor', 'Sponsor enabled', 'Risk score', 'Risk level', 'Risk factors', 'Recommended action', 'Review status', 'Last reviewed'],
      ...all.map((g) => [g.display_name, g.email, g.domain, g.company_name, g.external_type, g.account_enabled, g.invitation_status, formatDate(g.created_at_ms), formatDate(g.last_sign_in_at, true), g.sponsor_display_name, g.sponsor_enabled, g.risk_score, g.risk_level, g.risk_factors.map((f) => f.label).join('; '), g.recommended_action, g.review_status, formatDate(g.last_reviewed_at)]),
    ])
  } else if (type === 'domains') {
    const domains = await listDomains(tenant.id)
    body = csv([
      ['Domain', 'Classification', 'Business owner', 'Review date', 'Guests', 'Active 90d', 'Inactive', 'Critical', 'High', 'With sensitive access', 'Avg risk', 'Last activity', 'Notes'],
      ...domains.map((d) => [d.domain, d.classification, d.business_owner, d.review_date, d.guest_count, d.active_count, d.inactive_count, d.critical_count, d.high_count, d.sensitive_count, d.avg_risk, formatDate(d.last_activity), d.notes]),
    ])
  } else if (type === 'organizations') {
    const organizations = await listOrganizations(tenant.id)
    body = csv([
      ['Organization', 'Relationship', 'Approval state', 'Domains', 'Business owner', 'Owner email', 'Review date', 'Identities', 'Active 90d', 'Inactive', 'Critical', 'High', 'With sensitive access', 'Avg risk', 'Last activity', 'Notes'],
      ...organizations.map((o) => [o.name, o.relationship_type, o.approval_state, o.domains.join('; '), o.business_owner, o.business_owner_email, o.review_date, o.identity_count, o.active_count, o.inactive_count, o.critical_count, o.high_count, o.sensitive_count, o.avg_risk, formatDate(o.last_activity), o.notes]),
    ])
  } else if (type === 'resources') {
    const resources = await listResources(tenant.id, { withGuests: true })
    body = csv([
      ['Resource', 'Type', 'Sensitive', 'Category', 'Internal members', 'External members', 'Visibility', 'URL'],
      ...resources.map((r) => [r.display_name, r.resource_type, r.is_sensitive, r.sensitivity_category, r.internal_member_count, r.external_member_count, r.visibility, r.web_url]),
    ])
  } else if (type === 'privileged') {
    if (!privilegedPagesEnabled(tenant.settings)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (!canExportPrivileged(session.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const detail = await getPrivilegedDetail(tenant.id, session.role, tenant.settings)
    body = csv([
      ['Display name', 'Email', 'Class', 'Highest tier', 'Role', 'Assignment', 'Last activity', 'MFA method', 'Owner', 'Last reviewed', 'Risk score', 'Risk level'],
      ...detail.holders.map((h) => [
        h.displayName,
        h.email,
        IDENTITY_CLASS_LABEL[h.identityClass],
        h.privilegeTier != null ? TIER_LABEL[h.privilegeTier] : '',
        h.roleName,
        h.assignmentStates.map((s) => ASSIGNMENT_STATE_LABEL[s]).join(' + '),
        h.lastActivityAt,
        h.mfaLabel,
        h.ownerDisplayName,
        h.lastReviewedAt,
        h.riskScore,
        h.riskLevel,
      ]),
    ])
  } else if (type === 'audit') {
    if (!can(session.role, 'audit.view')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const events: Awaited<ReturnType<typeof listAudit>>['events'] = []
    for (let page = 1; page <= 40; page++) {
      const res = await listAudit(tenant.id, { page })
      events.push(...res.events)
      if (events.length >= res.total) break
    }
    body = csv([
      ['Timestamp', 'Actor', 'Action', 'Target type', 'Target', 'Reason', 'Previous state', 'New state', 'Source IP', 'Correlation'],
      ...events.map((e) => [e.created_at, e.actor_email, e.action, e.target_type, e.target_label ?? e.target_id, e.reason, JSON.stringify(e.previous_state ?? ''), JSON.stringify(e.new_state ?? ''), e.source_ip, e.correlation_id]),
    ])
  } else {
    return NextResponse.json({ error: 'unknown export type' }, { status: 400 })
  }
  name = `aigis-${type}-${new Date().toISOString().slice(0, 10)}.csv`
  await audit(session, { action: 'report.exported', targetType: 'export', targetLabel: name })
  return new NextResponse(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` } })
}
