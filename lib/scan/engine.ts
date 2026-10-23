import 'server-only'
import { db } from '@/lib/supabase/admin'
import { GraphClient } from '@/lib/graph/client'
import {
  fetchAppAssignments,
  fetchEnterpriseApps,
  fetchGroupMembers,
  fetchGroupOwners,
  fetchGroupSite,
  fetchGroups,
  fetchGuests,
  fetchOrganization,
  type GraphGroup,
  type GraphUser,
} from '@/lib/graph/queries'
import { detectSensitivity } from '@/lib/risk/sensitivity'
import { computeRisk, DEFAULT_RISK_POLICY, type RiskPolicyConfig } from '@/lib/risk/engine'
import type { DomainClassification, ExternalDomain, Guest, RelationshipType, Resource, ResourceType } from '@/lib/types'
import { audit } from '@/lib/audit'

type Phase = 'organization' | 'guests' | 'groups' | 'memberships' | 'sites' | 'apps' | 'scoring' | 'diff'
const PHASES: Phase[] = ['organization', 'guests', 'groups', 'memberships', 'sites', 'apps', 'scoring', 'diff']

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

import { classifyExternalIdentity, defaultOrganizationName } from '@/lib/identity/classify'
import { resolveCompany } from '@/lib/identity/company'
import { evaluateAlertRules } from '@/lib/alerts/evaluate'

function domainOf(user: GraphUser) {
  const mail = user.mail ?? ''
  if (mail.includes('@')) return mail.split('@')[1].toLowerCase()
  const upn = user.userPrincipalName ?? ''
  const m = upn.match(/_(.+?)#EXT#/i)
  if (m) return m[1].toLowerCase()
  return null
}

function groupType(g: GraphGroup): ResourceType {
  if (g.resourceProvisioningOptions?.includes('Team')) return 'team'
  if (g.groupTypes?.includes('Unified')) return 'm365_group'
  return 'security_group'
}

async function setProgress(jobId: string, progress: Record<string, unknown>) {
  await db().from('scan_jobs').update({ progress }).eq('id', jobId)
}

export async function createScanJob(tenantId: string, scanType: string, startedBy: string | null) {
  const { data, error } = await db()
    .from('scan_jobs')
    .insert({ tenant_id: tenantId, scan_type: scanType, status: 'queued', started_by: startedBy, progress: { percent: 0, phase: 'queued', phases: Object.fromEntries(PHASES.map((p) => [p, 'pending'])) } })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

/** Re-scores every guest for the tenant from the local inventory. Used by live scans and demo tenants. */
export async function rescoreTenant(tenantId: string, scanJobId: string | null, policy: RiskPolicyConfig = DEFAULT_RISK_POLICY) {
  const supabase = db()
  const [{ data: guests }, { data: domains }, { data: memberships }, { data: resources }] = await Promise.all([
    supabase.from('guest_identities').select('*').eq('tenant_id', tenantId).is('removed_at', null),
    supabase.from('external_domains').select('id,domain,classification').eq('tenant_id', tenantId),
    supabase.from('resource_memberships').select('guest_id,resource_id,membership_type').eq('tenant_id', tenantId).is('removed_at', null),
    supabase.from('resources').select('id,resource_type,is_sensitive').eq('tenant_id', tenantId).is('removed_at', null),
  ])
  const domainMap = new Map((domains ?? []).map((d) => [d.domain as string, d.classification as DomainClassification]))
  const resourceMap = new Map((resources ?? []).map((r) => [r.id as string, r]))
  const byGuest = new Map<string, { isSensitive: boolean; isOwner: boolean; type: string }[]>()
  for (const m of memberships ?? []) {
    const r = resourceMap.get(m.resource_id as string)
    if (!r) continue
    const list = byGuest.get(m.guest_id as string) ?? []
    list.push({ isSensitive: Boolean(r.is_sensitive), isOwner: m.membership_type === 'owner', type: r.resource_type as string })
    byGuest.set(m.guest_id as string, list)
  }

  const updates: Partial<Guest>[] = []
  const scoreRows: Record<string, unknown>[] = []
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const g of (guests ?? []) as Guest[]) {
    const risk = computeRisk(
      {
        accountEnabled: g.account_enabled,
        invitationStatus: g.invitation_status,
        createdAt: g.created_at_ms,
        lastSignInAt: g.last_sign_in_at,
        lastNonInteractiveSignInAt: g.last_non_interactive_sign_in_at,
        authMethods: g.auth_methods ?? [],
        hasSponsor: Boolean(g.sponsor_ms_object_id),
        sponsorEnabled: g.sponsor_enabled,
        domainClassification: domainMap.get(g.domain ?? '') ?? 'unknown',
        lastReviewedAt: g.last_reviewed_at,
        memberships: byGuest.get(g.id) ?? [],
      },
      policy,
    )
    counts[risk.level]++
    updates.push({ id: g.id, risk_score: risk.score, risk_level: risk.level, risk_factors: risk.factors, recommended_action: risk.recommendedAction })
    scoreRows.push({ tenant_id: tenantId, guest_id: g.id, scan_job_id: scanJobId, score: risk.score, level: risk.level, factors: risk.factors })
  }
  for (const batch of chunk(updates, 200)) {
    await Promise.all(
      batch.map((u) =>
        supabase
          .from('guest_identities')
          .update({ risk_score: u.risk_score, risk_level: u.risk_level, risk_factors: u.risk_factors, recommended_action: u.recommended_action })
          .eq('id', u.id as string),
      ),
    )
  }
  for (const batch of chunk(scoreRows, 500)) await supabase.from('risk_scores').insert(batch)
  return counts
}

export async function snapshotMetrics(tenantId: string, scanJobId: string | null) {
  const supabase = db()
  const [guests, domains, resources, memberships] = await Promise.all([
    supabase.from('guest_identities').select('risk_level,account_enabled,last_sign_in_at,invitation_status,sponsor_ms_object_id,review_status').eq('tenant_id', tenantId).is('removed_at', null),
    supabase.from('external_domains').select('classification').eq('tenant_id', tenantId),
    supabase.from('resources').select('resource_type,is_sensitive,external_member_count').eq('tenant_id', tenantId).is('removed_at', null),
    supabase.from('resource_memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('removed_at', null),
  ])
  const g = guests.data ?? []
  const cutoff = Date.now() - 90 * 86_400_000
  const snapshot = {
    total_guests: g.length,
    critical: g.filter((x) => x.risk_level === 'critical').length,
    high: g.filter((x) => x.risk_level === 'high').length,
    medium: g.filter((x) => x.risk_level === 'medium').length,
    low: g.filter((x) => x.risk_level === 'low').length,
    inactive_90: g.filter((x) => !x.last_sign_in_at || new Date(x.last_sign_in_at).getTime() < cutoff).length,
    never_signed_in: g.filter((x) => !x.last_sign_in_at).length,
    pending_invites: g.filter((x) => x.invitation_status === 'PendingAcceptance').length,
    no_sponsor: g.filter((x) => !x.sponsor_ms_object_id).length,
    disabled: g.filter((x) => !x.account_enabled).length,
    domains: domains.data?.length ?? 0,
    unknown_domains: (domains.data ?? []).filter((d) => d.classification === 'unknown').length,
    resources_with_guests: (resources.data ?? []).filter((r) => (r.external_member_count ?? 0) > 0).length,
    sensitive_with_guests: (resources.data ?? []).filter((r) => r.is_sensitive && (r.external_member_count ?? 0) > 0).length,
    memberships: memberships.count ?? 0,
  }
  await supabase.from('scan_results').insert({ tenant_id: tenantId, scan_job_id: scanJobId, snapshot })
  return snapshot
}

export async function generateFindings(tenantId: string) {
  const supabase = db()
  await supabase.from('risk_findings').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('tenant_id', tenantId).eq('status', 'open')
  const { data: guests } = await supabase
    .from('guest_identities')
    .select('id,display_name,email,risk_level,risk_factors,domain')
    .eq('tenant_id', tenantId)
    .is('removed_at', null)
    .in('risk_level', ['critical', 'high'])
  const rows = (guests ?? []).flatMap((g) => {
    const factors = (g.risk_factors as { key: string; label: string; points: number }[]) ?? []
    const top = [...factors].sort((a, b) => b.points - a.points)[0]
    if (!top) return []
    return [
      {
        tenant_id: tenantId,
        guest_id: g.id,
        severity: g.risk_level,
        finding_type: top.key,
        title: `${g.display_name ?? g.email}: ${top.label}`,
        description: factors.map((f) => f.label).join(' · '),
        status: 'open',
      },
    ]
  })
  for (const batch of chunk(rows, 500)) await supabase.from('risk_findings').insert(batch)
  return rows.length
}

export async function runScan(jobId: string, tenantId: string) {
  const supabase = db()
  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
  if (!tenant) throw new Error('Tenant not found')
  const phases: Record<string, 'pending' | 'running' | 'done' | 'error'> = Object.fromEntries(PHASES.map((p) => [p, 'pending']))
  const progress = async (phase: Phase, percent: number, message: string, state: 'running' | 'done' = 'running') => {
    phases[phase] = state
    await setProgress(jobId, { phase, percent, message, phases })
  }
  await supabase.from('scan_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', jobId)
  const now = new Date().toISOString()
  const summary: Record<string, number> = {}

  try {
    if (tenant.is_demo) {
      for (const [i, p] of PHASES.entries()) {
        await progress(p, Math.round(((i + 0.5) / PHASES.length) * 100), `Simulating ${p}…`)
        await new Promise((r) => setTimeout(r, 350))
        await progress(p, Math.round(((i + 1) / PHASES.length) * 100), `${p} complete`, 'done')
      }
    } else {
      const g = new GraphClient(tenant.ms_tenant_id)

      await progress('organization', 2, 'Reading tenant organization…')
      const org = await fetchOrganization(g)
      const verified = org.verifiedDomains.map((d) => d.name.toLowerCase())
      await supabase
        .from('tenants')
        .update({ display_name: org.displayName, verified_domains: verified, primary_domain: org.verifiedDomains.find((d) => d.isDefault)?.name ?? verified[0] ?? null })
        .eq('id', tenantId)
      await progress('organization', 5, `Organization ${org.displayName}`, 'done')

      await progress('guests', 8, 'Enumerating guest users…')
      const graphGuests = await fetchGuests(g, (n) => progress('guests', Math.min(25, 8 + Math.floor(n / 200)), `${n} guests discovered…`))
      summary.guests = graphGuests.length

      const domainNames = Array.from(new Set(graphGuests.map(domainOf).filter((d): d is string => Boolean(d))))
      await supabase
        .from('external_domains')
        .upsert(domainNames.map((domain) => ({ tenant_id: tenantId, domain, last_seen_at: now })), { onConflict: 'tenant_id,domain', ignoreDuplicates: false })
      const domainIdByName = new Map<string, string>()
      const orgByDomain = new Map<string, { id: string; relationship_type: RelationshipType }>()
      {
        // Every domain belongs to exactly one external organization. Domains that
        // appear for the first time get an organization auto-created from the most
        // common companyName on their identities (falling back to the domain itself).
        const { data: domainRows } = await supabase.from('external_domains').select('id,domain,organization_id').eq('tenant_id', tenantId)
        const orphanDomains = (domainRows ?? []).filter((d) => !d.organization_id)
        if (orphanDomains.length) {
          const orgInserts = orphanDomains.map((d) => ({
            tenant_id: tenantId,
            seed_domain_id: d.id as string,
            name: defaultOrganizationName(d.domain as string, graphGuests.filter((u) => domainOf(u) === d.domain).map((u) => u.companyName)),
            first_seen_at: now,
            last_seen_at: now,
          }))
          const { data: createdOrgs } = await supabase.from('external_organizations').insert(orgInserts).select('id,seed_domain_id')
          for (const o of createdOrgs ?? []) {
            await supabase.from('external_domains').update({ organization_id: o.id }).eq('id', o.seed_domain_id as string)
          }
        }
        const { data: linkedDomains } = await supabase
          .from('external_domains')
          .select('id,domain,organization_id, organization:external_organizations(id,relationship_type)')
          .eq('tenant_id', tenantId)
        for (const d of linkedDomains ?? []) {
          domainIdByName.set(d.domain as string, d.id as string)
          const org = d.organization as unknown as { id: string; relationship_type: RelationshipType } | null
          if (org) orgByDomain.set(d.domain as string, org)
        }
        if (domainNames.length) await supabase.from('external_organizations').update({ last_seen_at: now }).eq('tenant_id', tenantId).in('id', Array.from(new Set(Array.from(orgByDomain.values()).map((o) => o.id))))
      }

      const guestRows = graphGuests.map((u) => {
        const sponsor = u.sponsors?.[0]
        const domain = domainOf(u)
        const org = domain ? orgByDomain.get(domain) ?? null : null
        const company = resolveCompany(u.companyName, domain)
        const classification = classifyExternalIdentity({
          userType: u.userType,
          userPrincipalName: u.userPrincipalName,
          mail: u.mail,
          externalUserState: u.externalUserState,
          companyName: u.companyName,
          jobTitle: u.jobTitle,
          creationType: u.creationType,
          domain,
          tenantVerifiedDomains: verified,
          organizationRelationship: org?.relationship_type ?? null,
        })
        return {
          identity_class: 'external' as const,
          external_type: classification.external_type,
          classification_evidence: classification.evidence,
          external_organization_id: org?.id ?? null,
          tenant_id: tenantId,
          ms_object_id: u.id,
          display_name: u.displayName ?? null,
          email: u.mail ?? null,
          upn: u.userPrincipalName ?? null,
          domain,
          external_domain_id: domain ? domainIdByName.get(domain) ?? null : null,
          company_name: company.name,
          company_source: company.source,
          account_enabled: u.accountEnabled ?? true,
          invitation_status: u.externalUserState ?? null,
          user_type: u.userType ?? 'Guest',
          created_at_ms: u.createdDateTime ?? null,
          last_sign_in_at: u.signInActivity?.lastSignInDateTime ?? null,
          last_non_interactive_sign_in_at: u.signInActivity?.lastNonInteractiveSignInDateTime ?? null,
          sponsor_ms_object_id: sponsor?.id ?? null,
          sponsor_display_name: sponsor?.displayName ?? null,
          sponsor_email: sponsor?.mail ?? null,
          sponsor_enabled: sponsor?.accountEnabled ?? null,
          last_seen_at: now,
          removed_at: null,
        }
      })
      const { data: existingGuests } = await supabase.from('guest_identities').select('id,ms_object_id,removed_at').eq('tenant_id', tenantId)
      const existingIds = new Set((existingGuests ?? []).filter((e) => !e.removed_at).map((e) => e.ms_object_id as string))
      const incomingIds = new Set(guestRows.map((r) => r.ms_object_id))
      for (const batch of chunk(guestRows, 500)) await supabase.from('guest_identities').upsert(batch, { onConflict: 'tenant_id,ms_object_id' })
      const removedGuestIds = (existingGuests ?? []).filter((e) => !e.removed_at && !incomingIds.has(e.ms_object_id as string)).map((e) => e.id as string)
      if (removedGuestIds.length) await supabase.from('guest_identities').update({ removed_at: now }).in('id', removedGuestIds)
      summary.new_guests = guestRows.filter((r) => !existingIds.has(r.ms_object_id)).length
      summary.removed_guests = removedGuestIds.length
      await progress('guests', 28, `${graphGuests.length} guests inventoried`, 'done')

      const { data: guestIdRows } = await supabase.from('guest_identities').select('id,ms_object_id').eq('tenant_id', tenantId).is('removed_at', null)
      const guestIdByMs = new Map((guestIdRows ?? []).map((r) => [r.ms_object_id as string, r.id as string]))

      await progress('groups', 30, 'Enumerating groups and teams…')
      const groups = await fetchGroups(g, (n) => progress('groups', Math.min(45, 30 + Math.floor(n / 100)), `${n} groups discovered…`))
      summary.groups = groups.length
      const sensitiveOverrides = (tenant.settings?.sensitivity_overrides ?? {}) as Record<string, never>
      const resourceRows = groups.map((grp) => {
        const sens = detectSensitivity(grp.displayName, grp.description, sensitiveOverrides)
        return {
          tenant_id: tenantId,
          ms_object_id: grp.id,
          resource_type: groupType(grp),
          display_name: grp.displayName,
          description: grp.description ?? null,
          visibility: grp.visibility ?? null,
          mail: grp.mail ?? null,
          is_sensitive: sens.isSensitive,
          sensitivity_category: sens.category,
          last_seen_at: now,
          removed_at: null,
        }
      })
      for (const batch of chunk(resourceRows, 500)) await supabase.from('resources').upsert(batch, { onConflict: 'tenant_id,ms_object_id,resource_type' })
      await progress('groups', 48, `${groups.length} groups inventoried`, 'done')

      await progress('memberships', 50, 'Resolving guest memberships…')
      const { data: resourceRowsDb } = await supabase.from('resources').select('id,ms_object_id,resource_type').eq('tenant_id', tenantId).is('removed_at', null)
      const resourceIdByMs = new Map((resourceRowsDb ?? []).map((r) => [`${r.resource_type}:${r.ms_object_id}`, r.id as string]))
      const membershipRows: Record<string, unknown>[] = []
      const counts = new Map<string, { internal: number; external: number; owners: { id: string; displayName: string; mail?: string }[] }>()
      let processed = 0
      for (const batch of chunk(groups, 10)) {
        await Promise.all(
          batch.map(async (grp) => {
            const [members, owners] = await Promise.all([fetchGroupMembers(g, grp.id), fetchGroupOwners(g, grp.id)])
            const rid = resourceIdByMs.get(`${groupType(grp)}:${grp.id}`)
            if (!rid) return
            let internal = 0
            let external = 0
            for (const m of members) {
              if (m.userType === 'Guest' && guestIdByMs.has(m.id)) {
                external++
                membershipRows.push({ tenant_id: tenantId, guest_id: guestIdByMs.get(m.id), resource_id: rid, membership_type: 'member', last_seen_at: now, removed_at: null })
              } else internal++
            }
            for (const o of owners) {
              if (o.userType === 'Guest' && guestIdByMs.has(o.id)) {
                membershipRows.push({ tenant_id: tenantId, guest_id: guestIdByMs.get(o.id), resource_id: rid, membership_type: 'owner', last_seen_at: now, removed_at: null })
              }
            }
            counts.set(rid, { internal, external, owners: owners.map((o) => ({ id: o.id, displayName: o.displayName ?? '', mail: o.mail })) })
          }),
        )
        processed += batch.length
        await progress('memberships', Math.min(68, 50 + Math.floor((processed / Math.max(1, groups.length)) * 18)), `${processed}/${groups.length} groups resolved…`)
      }
      for (const [rid, c] of counts) {
        await supabase.from('resources').update({ internal_member_count: c.internal, external_member_count: c.external, owners: c.owners }).eq('id', rid)
      }
      await progress('memberships', 70, `${membershipRows.length} guest memberships`, 'done')

      await progress('sites', 72, 'Linking SharePoint sites to groups with guests…')
      const groupsWithGuests = groups.filter((grp) => (counts.get(resourceIdByMs.get(`${groupType(grp)}:${grp.id}`) ?? '')?.external ?? 0) > 0 && grp.groupTypes?.includes('Unified'))
      for (const batch of chunk(groupsWithGuests, 10)) {
        await Promise.all(
          batch.map(async (grp) => {
            const site = await fetchGroupSite(g, grp.id)
            if (!site) return
            const parentId = resourceIdByMs.get(`${groupType(grp)}:${grp.id}`)
            const sens = detectSensitivity(site.displayName ?? site.name ?? grp.displayName, site.description)
            const { data: siteRow } = await supabase
              .from('resources')
              .upsert(
                {
                  tenant_id: tenantId,
                  ms_object_id: site.id,
                  resource_type: 'sharepoint_site',
                  display_name: site.displayName ?? site.name ?? grp.displayName,
                  description: site.description ?? null,
                  web_url: site.webUrl ?? null,
                  is_sensitive: sens.isSensitive,
                  sensitivity_category: sens.category,
                  linked_resource_id: parentId ?? null,
                  external_member_count: counts.get(parentId ?? '')?.external ?? 0,
                  internal_member_count: counts.get(parentId ?? '')?.internal ?? 0,
                  last_seen_at: now,
                  removed_at: null,
                },
                { onConflict: 'tenant_id,ms_object_id,resource_type' },
              )
              .select('id')
              .single()
            if (siteRow && parentId) {
              for (const m of membershipRows.filter((r) => r.resource_id === parentId)) {
                membershipRows.push({ ...m, resource_id: siteRow.id })
              }
            }
          }),
        )
      }
      await progress('sites', 80, 'SharePoint sites linked', 'done')

      await progress('apps', 82, 'Checking enterprise app assignments…')
      try {
        const apps = await fetchEnterpriseApps(g)
        summary.apps = apps.length
        for (const batch of chunk(apps, 10)) {
          await Promise.all(
            batch.map(async (app) => {
              const assignments = await fetchAppAssignments(g, app.id)
              const guestAssignments = assignments.filter((a) => a.principalType === 'User' && guestIdByMs.has(a.principalId))
              if (guestAssignments.length === 0) return
              const sens = detectSensitivity(app.displayName)
              const { data: appRow } = await supabase
                .from('resources')
                .upsert(
                  {
                    tenant_id: tenantId,
                    ms_object_id: app.id,
                    resource_type: 'enterprise_app',
                    display_name: app.displayName,
                    web_url: app.homepage ?? null,
                    is_sensitive: sens.isSensitive,
                    sensitivity_category: sens.category,
                    external_member_count: guestAssignments.length,
                    internal_member_count: assignments.length - guestAssignments.length,
                    metadata: { appId: app.appId },
                    last_seen_at: now,
                    removed_at: null,
                  },
                  { onConflict: 'tenant_id,ms_object_id,resource_type' },
                )
                .select('id')
                .single()
              if (!appRow) return
              for (const a of guestAssignments) {
                membershipRows.push({ tenant_id: tenantId, guest_id: guestIdByMs.get(a.principalId), resource_id: appRow.id, membership_type: 'member', last_seen_at: now, removed_at: null })
              }
            }),
          )
        }
      } catch (err) {
        summary.apps_error = 1
        console.log('[v0] enterprise app enumeration skipped:', err instanceof Error ? err.message : err)
      }
      await progress('apps', 88, 'Enterprise apps checked', 'done')

      const { data: priorMemberships } = await supabase.from('resource_memberships').select('id,guest_id,resource_id').eq('tenant_id', tenantId).is('removed_at', null)
      const priorKeys = new Set((priorMemberships ?? []).map((m) => `${m.guest_id}:${m.resource_id}`))
      const incomingKeys = new Set(membershipRows.map((m) => `${m.guest_id}:${m.resource_id}`))
      const dedup = Array.from(new Map(membershipRows.map((m) => [`${m.guest_id}:${m.resource_id}`, m])).values())
      for (const batch of chunk(dedup, 500)) await supabase.from('resource_memberships').upsert(batch, { onConflict: 'tenant_id,guest_id,resource_id' })
      const removedMembershipIds = (priorMemberships ?? []).filter((m) => !incomingKeys.has(`${m.guest_id}:${m.resource_id}`)).map((m) => m.id)
      if (removedMembershipIds.length) await supabase.from('resource_memberships').update({ removed_at: now }).in('id', removedMembershipIds)
      summary.new_memberships = dedup.filter((m) => !priorKeys.has(`${m.guest_id}:${m.resource_id}`)).length
      summary.removed_memberships = removedMembershipIds.length
      summary.memberships = dedup.length
    }

    await progress('scoring', 90, 'Calculating risk scores…')
    const policy = { ...DEFAULT_RISK_POLICY, ...((tenant.settings?.risk_policy as Partial<RiskPolicyConfig>) ?? {}) }
    const counts = await rescoreTenant(tenantId, jobId, policy)
    Object.assign(summary, counts)
    summary.findings = await generateFindings(tenantId)
    await progress('scoring', 96, 'Risk scores calculated', 'done')

    await progress('diff', 97, 'Recording snapshot…')
    await snapshotMetrics(tenantId, jobId)
    await progress('diff', 100, 'Scan complete', 'done')

    try {
      const fired = await evaluateAlertRules(tenantId, { scanJobId: jobId, scanStartedAt: now })
      summary.alerts = fired.created
      summary.alert_emails = fired.emailed
    } catch (err) {
      console.log('[v0] alert rule evaluation failed:', err instanceof Error ? err.message : err)
    }

    await supabase.from('scan_jobs').update({ status: 'completed', completed_at: new Date().toISOString(), summary }).eq('id', jobId)
    await supabase.from('tenants').update({ last_scan_at: new Date().toISOString(), connection_status: 'connected' }).eq('id', tenantId)
    await audit({ tenantId, userId: '', email: 'system' } as never, { action: 'scan.completed', targetType: 'scan_job', targetId: jobId, newState: summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed'
    await supabase.from('scan_jobs').update({ status: 'failed', completed_at: new Date().toISOString(), error: message, progress: { ...(await currentProgress(jobId)), phases } }).eq('id', jobId)
    await audit({ tenantId, userId: '', email: 'system' } as never, { action: 'scan.failed', targetType: 'scan_job', targetId: jobId, reason: message })
    try {
      await evaluateAlertRules(tenantId, { scanJobId: jobId, scanStartedAt: now, scanFailed: message })
    } catch (alertErr) {
      console.log('[v0] scan-failed alert evaluation failed:', alertErr instanceof Error ? alertErr.message : alertErr)
    }
    throw err
  }
}

async function currentProgress(jobId: string) {
  const { data } = await db().from('scan_jobs').select('progress').eq('id', jobId).single()
  return (data?.progress as Record<string, unknown>) ?? {}
}
