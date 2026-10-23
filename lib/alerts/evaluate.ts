import 'server-only'
import { db } from '@/lib/supabase/admin'
import { loadMailTenant, sendMail, publicOrigin } from '@/lib/email/mailer'
import { alertDigest, type AlertEmailItem } from '@/lib/email/templates'
import { ALERT_TRIGGER_LABELS, type AlertRule, type ApprovalState, type RiskLevel } from '@/lib/types'

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const DAY = 86_400_000

type GuestRow = {
  id: string
  display_name: string | null
  email: string | null
  domain: string | null
  risk_level: RiskLevel
  risk_score: number
  first_seen_at: string
  last_sign_in_at: string | null
  created_at_ms: string | null
  external_organization_id: string | null
  account_enabled: boolean
}

type Candidate = {
  dedupe_key: string
  title: string
  description: string | null
  guest_id?: string | null
  resource_id?: string | null
  metadata?: Record<string, unknown>
  emailItem: AlertEmailItem
}

export type EvaluateOptions = {
  scanJobId?: string | null
  scanStartedAt?: string | null
  scanFailed?: string | null
  /** Restrict to time-based triggers (cron) instead of the full post-scan set. */
  only?: AlertRule['trigger_type'][]
}

function guestLabel(g: Pick<GuestRow, 'display_name' | 'email'>) {
  return g.display_name ?? g.email ?? 'External identity'
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Evaluate every enabled alert rule for a tenant. Creates `alerts` rows for
 * new matches (deduplicated per rule + subject) and emails a digest per rule
 * through Microsoft Graph when the rule has email enabled.
 */
export async function evaluateAlertRules(tenantId: string, opts: EvaluateOptions = {}) {
  const supabase = db()
  const tenant = await loadMailTenant(tenantId)
  if (!tenant) return { created: 0, emailed: 0 }

  let rulesQuery = supabase.from('alert_rules').select('*').eq('tenant_id', tenantId).eq('enabled', true)
  if (opts.only?.length) rulesQuery = rulesQuery.in('trigger_type', opts.only)
  const { data: ruleRows } = await rulesQuery
  const rules = (ruleRows ?? []) as AlertRule[]
  if (rules.length === 0) return { created: 0, emailed: 0 }

  const needsGuests = rules.some((r) => !['review_overdue', 'scan_failed'].includes(r.trigger_type))
  const guests: GuestRow[] = needsGuests
    ? (((await supabase.from('guest_identities').select('id,display_name,email,domain,risk_level,risk_score,first_seen_at,last_sign_in_at,created_at_ms,external_organization_id,account_enabled').eq('tenant_id', tenantId).is('removed_at', null)).data ?? []) as GuestRow[])
    : []
  const guestById = new Map(guests.map((g) => [g.id, g]))

  let scanType: string | null = null
  if (opts.scanJobId) {
    const { data: job } = await supabase.from('scan_jobs').select('scan_type').eq('id', opts.scanJobId).maybeSingle()
    scanType = (job?.scan_type as string | undefined) ?? null
  }

  const now = Date.now()
  const origin = await publicOrigin()
  let created = 0
  let emailed = 0

  for (const rule of rules) {
    const candidates = await candidatesFor(rule, { tenantId, guests, guestById, now, scanType, opts })
    if (candidates.length === 0) continue

    const keys = candidates.map((c) => c.dedupe_key)
    const existing = new Set<string>()
    for (const batch of chunk(keys, 400)) {
      const { data } = await supabase.from('alerts').select('dedupe_key').eq('tenant_id', tenantId).in('dedupe_key', batch)
      for (const row of data ?? []) existing.add(row.dedupe_key as string)
    }
    const fresh = candidates.filter((c) => !existing.has(c.dedupe_key))
    if (fresh.length === 0) continue

    const { data: inserted } = await supabase
      .from('alerts')
      .insert(
        fresh.map((c) => ({
          tenant_id: tenantId,
          rule_id: rule.id,
          alert_type: rule.trigger_type,
          severity: rule.severity,
          title: c.title,
          description: c.description,
          guest_id: c.guest_id ?? null,
          resource_id: c.resource_id ?? null,
          dedupe_key: c.dedupe_key,
          metadata: { ...(c.metadata ?? {}), scan_job_id: opts.scanJobId ?? null },
        })),
      )
      .select('id')
    const insertedIds = (inserted ?? []).map((r) => r.id as string)
    created += insertedIds.length
    await supabase.from('alert_rules').update({ last_fired_at: new Date().toISOString() }).eq('id', rule.id)

    if (rule.notify_email && rule.recipients.length > 0 && insertedIds.length > 0) {
      const mail = alertDigest({
        tenantName: tenant.display_name,
        ruleName: rule.name,
        severity: rule.severity,
        triggerLabel: ALERT_TRIGGER_LABELS[rule.trigger_type]?.label ?? rule.trigger_type,
        items: fresh.map((c) => c.emailItem),
        origin,
      })
      const result = await sendMail(tenant, { kind: 'alert', to: rule.recipients, subject: mail.subject, html: mail.html, relatedType: 'alert_rule', relatedId: rule.id })
      const stamp = result.ok ? { email_sent_at: new Date().toISOString(), email_error: null } : { email_error: result.error }
      await supabase.from('alerts').update(stamp).in('id', insertedIds)
      if (result.ok && !result.skipped) emailed += 1
    }
  }

  return { created, emailed }
}

type Ctx = { tenantId: string; guests: GuestRow[]; guestById: Map<string, GuestRow>; now: number; scanType: string | null; opts: EvaluateOptions }

async function candidatesFor(rule: AlertRule, ctx: Ctx): Promise<Candidate[]> {
  const supabase = db()
  const c = rule.conditions ?? {}

  switch (rule.trigger_type) {
    case 'new_external_identity': {
      // The very first scan "discovers" every identity; alerting on all of them is noise.
      if (ctx.scanType === 'initial_full' || !ctx.opts.scanStartedAt) return []
      const since = new Date(ctx.opts.scanStartedAt).getTime() - 5 * 60_000
      return ctx.guests
        .filter((g) => new Date(g.first_seen_at).getTime() >= since)
        .map((g) => ({
          dedupe_key: `${rule.id}:new:${g.id}`,
          title: `New external identity: ${guestLabel(g)}`,
          description: g.domain ? `From ${g.domain}. First seen in the latest scan.` : 'First seen in the latest scan.',
          guest_id: g.id,
          emailItem: { title: guestLabel(g), detail: g.domain, href: `/guests/${g.id}` },
        }))
    }

    case 'risk_level': {
      const min = c.min_risk_level ?? 'high'
      return ctx.guests
        .filter((g) => RISK_ORDER[g.risk_level] >= RISK_ORDER[min])
        .map((g) => ({
          dedupe_key: `${rule.id}:risk:${g.id}:${g.risk_level}`,
          title: `${g.risk_level === 'critical' ? 'Critical' : 'High'} risk: ${guestLabel(g)}`,
          description: `Risk score ${g.risk_score} (${g.risk_level}).`,
          guest_id: g.id,
          metadata: { risk_level: g.risk_level, risk_score: g.risk_score },
          emailItem: { title: guestLabel(g), detail: `${g.risk_level} · score ${g.risk_score}`, href: `/guests/${g.id}` },
        }))
    }

    case 'unapproved_organization': {
      const states: ApprovalState[] = c.approval_states?.length ? c.approval_states : ['unreviewed', 'restricted', 'blocked']
      const orgIds = Array.from(new Set(ctx.guests.map((g) => g.external_organization_id).filter(Boolean))) as string[]
      if (orgIds.length === 0) return []
      const orgs = new Map<string, { name: string; approval_state: ApprovalState }>()
      for (const batch of chunk(orgIds, 400)) {
        const { data } = await supabase.from('external_organizations').select('id,name,approval_state').eq('tenant_id', ctx.tenantId).in('id', batch).in('approval_state', states)
        for (const o of data ?? []) orgs.set(o.id as string, { name: o.name as string, approval_state: o.approval_state as ApprovalState })
      }
      if (orgs.size === 0) return []
      let withAccess: Set<string> | null = null
      if (c.sensitive_only) {
        const { data } = await supabase.from('resource_memberships').select('guest_id, resource:resources!inner(is_sensitive)').eq('tenant_id', ctx.tenantId).is('removed_at', null).eq('resource.is_sensitive', true)
        withAccess = new Set((data ?? []).map((m) => m.guest_id as string))
      }
      return ctx.guests
        .filter((g) => g.external_organization_id && orgs.has(g.external_organization_id) && (!withAccess || withAccess.has(g.id)))
        .map((g) => {
          const org = orgs.get(g.external_organization_id as string)!
          return {
            dedupe_key: `${rule.id}:org:${g.id}:${org.approval_state}`,
            title: `${org.approval_state === 'blocked' ? 'Blocked' : org.approval_state === 'restricted' ? 'Restricted' : 'Unreviewed'} organization: ${guestLabel(g)}`,
            description: `${org.name} is ${org.approval_state}${c.sensitive_only ? ' and this identity holds sensitive access' : ''}.`,
            guest_id: g.id,
            metadata: { organization_id: g.external_organization_id, approval_state: org.approval_state },
            emailItem: { title: guestLabel(g), detail: `${org.name} · ${org.approval_state}`, href: `/guests/${g.id}` },
          }
        })
    }

    case 'sensitive_access': {
      const { data } = await supabase
        .from('resource_memberships')
        .select('guest_id,resource_id,first_seen_at, resource:resources!inner(id,display_name,is_sensitive,sensitivity_category)')
        .eq('tenant_id', ctx.tenantId)
        .is('removed_at', null)
        .eq('resource.is_sensitive', true)
      const out: Candidate[] = []
      for (const m of data ?? []) {
        const g = ctx.guestById.get(m.guest_id as string)
        const r = m.resource as unknown as { id: string; display_name: string; sensitivity_category: string | null } | null
        if (!g || !r) continue
        if (c.min_risk_level && RISK_ORDER[g.risk_level] < RISK_ORDER[c.min_risk_level]) continue
        out.push({
          dedupe_key: `${rule.id}:sens:${g.id}:${r.id}`,
          title: `Sensitive access: ${guestLabel(g)} in ${r.display_name}`,
          description: r.sensitivity_category ? `Resource tagged ${r.sensitivity_category}.` : 'Resource tagged sensitive.',
          guest_id: g.id,
          resource_id: r.id,
          emailItem: { title: `${guestLabel(g)} → ${r.display_name}`, detail: r.sensitivity_category, href: `/guests/${g.id}` },
        })
      }
      return out
    }

    case 'inactive_identity': {
      const days = Math.max(1, c.inactive_days ?? 90)
      const bucket = Math.floor(ctx.now / (30 * DAY))
      return ctx.guests
        .filter((g) => {
          const ref = g.last_sign_in_at ?? g.created_at_ms ?? g.first_seen_at
          return g.account_enabled && ctx.now - new Date(ref).getTime() > days * DAY
        })
        .map((g) => {
          const ref = g.last_sign_in_at ?? g.created_at_ms ?? g.first_seen_at
          const idle = Math.floor((ctx.now - new Date(ref).getTime()) / DAY)
          return {
            dedupe_key: `${rule.id}:inactive:${g.id}:${bucket}`,
            title: `Inactive ${idle} days: ${guestLabel(g)}`,
            description: g.last_sign_in_at ? `Last sign-in ${new Date(g.last_sign_in_at).toLocaleDateString('en-US')}.` : 'Never signed in.',
            guest_id: g.id,
            metadata: { idle_days: idle },
            emailItem: { title: guestLabel(g), detail: `${idle} days inactive`, href: `/guests/${g.id}` },
          }
        })
    }

    case 'review_overdue': {
      const { data: reviews } = await supabase.from('access_reviews').select('id,name,due_at').eq('tenant_id', ctx.tenantId).eq('status', 'active').lt('due_at', new Date(ctx.now).toISOString())
      if (!reviews?.length) return []
      const { data: pendingItems } = await supabase.from('review_items').select('review_id').eq('tenant_id', ctx.tenantId).eq('status', 'pending').in('review_id', reviews.map((r) => r.id))
      const pendingCount = new Map<string, number>()
      for (const i of pendingItems ?? []) pendingCount.set(i.review_id as string, (pendingCount.get(i.review_id as string) ?? 0) + 1)
      const day = Math.floor(ctx.now / DAY)
      return reviews
        .filter((r) => (pendingCount.get(r.id as string) ?? 0) > 0)
        .map((r) => ({
          dedupe_key: `${rule.id}:review:${r.id}:${day}`,
          title: `Review overdue: ${r.name}`,
          description: `${pendingCount.get(r.id as string)} decisions pending. Due ${new Date(r.due_at as string).toLocaleDateString('en-US')}.`,
          metadata: { review_id: r.id, pending: pendingCount.get(r.id as string) },
          emailItem: { title: r.name as string, detail: `${pendingCount.get(r.id as string)} pending`, href: `/reviews/${r.id}` },
        }))
    }

    case 'scan_failed': {
      if (!ctx.opts.scanFailed || !ctx.opts.scanJobId) return []
      return [
        {
          dedupe_key: `${rule.id}:scan:${ctx.opts.scanJobId}`,
          title: 'Scan failed',
          description: ctx.opts.scanFailed,
          metadata: { scan_job_id: ctx.opts.scanJobId },
          emailItem: { title: 'Scan failed', detail: ctx.opts.scanFailed, href: `/scans/${ctx.opts.scanJobId}` },
        },
      ]
    }

    default:
      return []
  }
}
