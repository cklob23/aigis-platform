import 'server-only'
import { db } from '@/lib/supabase/admin'
import { detectSensitivity } from '@/lib/risk/sensitivity'
import { generateFindings, rescoreTenant, snapshotMetrics } from '@/lib/scan/engine'
import { classifyExternalIdentity } from '@/lib/identity/classify'
import { hubRowsFromGuest, type GuestHubSource } from '@/lib/identity/provision'
import { withIdentityId, withMembershipIds } from '@/lib/identity/governance'
import { loadGovernanceMaps } from '@/lib/identity/governance-maps'
import { DEFAULT_AI_SETTINGS, type DomainClassification, type RelationshipType, type ResourceType } from '@/lib/types'
import { mustWrite } from '@/lib/supabase/write'

export const DEMO_MS_TENANT_ID = 'demo-northwind-health'

function companyNameFor(domain: string) {
  return domain.split('.')[0].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const FIRST = ['Amara', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farid', 'Grace', 'Hugo', 'Isla', 'Jonas', 'Kavya', 'Liam', 'Maya', 'Noah', 'Olu', 'Priya', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uma', 'Victor', 'Wren', 'Ximena', 'Yusuf', 'Zoe', 'Aiden', 'Beatriz', 'Caleb', 'Dana']
const LAST = ['Okafor', 'Hart', 'Nguyen', 'Patel', 'Rossi', 'Haddad', 'Lindqvist', 'Moreau', 'Campbell', 'Weber', 'Iyer', 'Kowalski', 'Santos', 'Fischer', 'Adeyemi', 'Sharma', 'Byrne', 'Alvarez', 'Berg', 'Nakamura', 'Costa', 'Petrov', 'Quintero', 'Reyes', 'Osman', 'Chen', 'Walsh', 'Duarte', 'Novak', 'Mensah']

const DOMAINS: { domain: string; classification: DomainClassification; weight: number; owner?: string }[] = [
  { domain: 'meridianlaw.com', classification: 'approved_partner', weight: 10, owner: 'Legal Ops' },
  { domain: 'aurorahealthsystems.org', classification: 'client', weight: 14, owner: 'Account Mgmt' },
  { domain: 'kestrelcloud.io', classification: 'vendor', weight: 12, owner: 'IT Platform' },
  { domain: 'bluefin-consulting.com', classification: 'contractor', weight: 9, owner: 'PMO' },
  { domain: 'tallgrassaudit.com', classification: 'temporary', weight: 6, owner: 'Finance' },
  { domain: 'orbitalstaffing.net', classification: 'contractor', weight: 8 },
  { domain: 'pinecrest-medical.com', classification: 'client', weight: 7 },
  { domain: 'gmail.com', classification: 'unknown', weight: 9 },
  { domain: 'outlook.com', classification: 'unknown', weight: 6 },
  { domain: 'hotmail.com', classification: 'unknown', weight: 3 },
  { domain: 'velocitymarketing.co', classification: 'vendor', weight: 5 },
  { domain: 'nimbusdesign.studio', classification: 'unknown', weight: 4 },
  { domain: 'harborpoint-cpa.com', classification: 'temporary', weight: 4 },
  { domain: 'lumen-devops.dev', classification: 'unknown', weight: 5 },
  { domain: 'graniteinsurance.com', classification: 'approved_partner', weight: 5 },
  { domain: 'ex-vendor-stratus.com', classification: 'blocked', weight: 3 },
  { domain: 'quickfix-it.biz', classification: 'unknown', weight: 2 },
  { domain: 'summitbio.com', classification: 'client', weight: 4 },
  { domain: 'northstar-recruiting.com', classification: 'vendor', weight: 3 },
  { domain: 'yahoo.com', classification: 'unknown', weight: 2 },
]

const RESOURCES: { name: string; type: ResourceType; desc?: string; visibility?: string }[] = [
  { name: 'Finance – Month End Close', type: 'team', desc: 'Close process coordination with external auditors', visibility: 'Private' },
  { name: 'Payroll Operations', type: 'team', visibility: 'Private' },
  { name: 'HR Leadership', type: 'team', desc: 'Compensation and benefits planning', visibility: 'Private' },
  { name: 'Executive Steering Committee', type: 'team', visibility: 'Private' },
  { name: 'Legal – Contracts Review', type: 'team', visibility: 'Private' },
  { name: 'Clinical Data Governance', type: 'team', desc: 'Patient data stewardship', visibility: 'Private' },
  { name: 'Project Aurora Migration', type: 'team', desc: 'Cloud migration with Kestrel Cloud', visibility: 'Private' },
  { name: 'Marketing Campaigns 2026', type: 'team', visibility: 'Public' },
  { name: 'Website Redesign', type: 'team', visibility: 'Public' },
  { name: 'Customer Success – Pinecrest', type: 'team', visibility: 'Private' },
  { name: 'Customer Success – Aurora Health', type: 'team', visibility: 'Private' },
  { name: 'DevOps Platform', type: 'team', desc: 'Infra, pipelines and secops', visibility: 'Private' },
  { name: 'Security Incident Response', type: 'team', visibility: 'Private' },
  { name: 'Facilities & Vendors', type: 'team', visibility: 'Public' },
  { name: 'All Company Social', type: 'team', visibility: 'Public' },
  { name: 'Procurement RFPs', type: 'team', visibility: 'Private' },
  { name: 'R&D – Product Roadmap', type: 'team', visibility: 'Private' },
  { name: 'Training & Enablement', type: 'team', visibility: 'Public' },
  { name: 'Board Materials', type: 'm365_group', desc: 'Board of directors document library', visibility: 'Private' },
  { name: 'M&A Diligence Room', type: 'm365_group', desc: 'Confidential acquisition diligence', visibility: 'Private' },
  { name: 'Benefits Open Enrollment', type: 'm365_group', visibility: 'Public' },
  { name: 'Vendor Onboarding', type: 'm365_group', visibility: 'Public' },
  { name: 'Partner Portal Content', type: 'm365_group', visibility: 'Public' },
  { name: 'Audit 2025 Workpapers', type: 'm365_group', desc: 'External audit evidence', visibility: 'Private' },
  { name: 'Staff Augmentation Pool', type: 'm365_group', visibility: 'Private' },
  { name: 'Data Analytics Guild', type: 'm365_group', visibility: 'Public' },
  { name: 'Salesforce', type: 'enterprise_app' },
  { name: 'Workday', type: 'enterprise_app', desc: 'HR system of record' },
  { name: 'ServiceNow', type: 'enterprise_app' },
  { name: 'Snowflake', type: 'enterprise_app', desc: 'Customer data warehouse' },
  { name: 'Figma', type: 'enterprise_app' },
  { name: 'GitHub Enterprise', type: 'enterprise_app', desc: 'Source code' },
  { name: 'Contractors – VPN Access', type: 'security_group' },
  { name: 'External Collaborators', type: 'security_group' },
  { name: 'Finance Shared Drive Readers', type: 'security_group' },
]

function pickWeighted<T extends { weight: number }>(items: T[], r: () => number) {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let x = r() * total
  for (const i of items) {
    x -= i.weight
    if (x <= 0) return i
  }
  return items[items.length - 1]
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export async function getOrCreateDemoTenant() {
  const supabase = db()
  const { data: existing } = await supabase.from('tenants').select('id').eq('ms_tenant_id', DEMO_MS_TENANT_ID).maybeSingle()
  if (existing) return existing.id as string
  return seedDemoTenant()
}

export async function resetDemoTenant() {
  const supabase = db()
  const { data: existing } = await supabase.from('tenants').select('id,organization_id').eq('ms_tenant_id', DEMO_MS_TENANT_ID).maybeSingle()
  if (existing) {
    mustWrite('organizations delete', await supabase.from('organizations').delete().eq('id', existing.organization_id))
  }
  return seedDemoTenant()
}

export async function ensureDemoUser() {
  const supabase = db()
  const email = 'demo.admin@northwindhealth.example'
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
  if (existing) return { id: existing.id as string, email, name: 'Demo Administrator' }
  const { data } = mustWrite(
    'users insert',
    await supabase.from('users').insert({ email, display_name: 'Demo Administrator', ms_tenant_id: DEMO_MS_TENANT_ID, ms_object_id: 'demo-admin-oid' }).select('id').single(),
  )
  if (!data?.id) throw new Error('users insert: missing id')
  return { id: data.id as string, email, name: 'Demo Administrator' }
}

async function seedDemoTenant() {
  const supabase = db()
  const r = rng(20260401)

  const { data: org } = mustWrite(
    'organizations insert',
    await supabase.from('organizations').insert({ name: 'Northwind Health' }).select('id').single(),
  )
  if (!org?.id) throw new Error('organizations insert: missing id')
  const orgId = org.id as string
  mustWrite(
    'subscriptions insert',
    await supabase.from('subscriptions').insert({ organization_id: orgId, plan: 'professional', status: 'active', seats: 5, current_period_end: daysAgo(-320) }),
  )
  const { data: tenant } = mustWrite(
    'tenants insert',
    await supabase
    .from('tenants')
    .insert({
      organization_id: orgId,
      ms_tenant_id: DEMO_MS_TENANT_ID,
      display_name: 'Northwind Health',
      primary_domain: 'northwindhealth.com',
      verified_domains: ['northwindhealth.com', 'northwind.onmicrosoft.com', 'nwh-clinics.org'],
      connection_status: 'connected',
      consent_granted_at: daysAgo(96),
      onboarding_step: 5,
      onboarding_completed_at: daysAgo(95),
      last_scan_at: daysAgo(0.2),
      is_demo: true,
      settings: { risk_policy: { inactiveDays: 90, staleDays: 180, reviewDays: 365 }, scan_schedule: 'daily', notifications: { email: true, weekly_digest: true }, ai: DEFAULT_AI_SETTINGS },
    })
    .select('id')
    .single(),
  )
  if (!tenant?.id) throw new Error('tenants insert: missing id')
  const tenantId = tenant.id as string
  const demoUser = await ensureDemoUser()
  mustWrite(
    'administrators insert',
    await supabase.from('administrators').insert({ tenant_id: tenantId, user_id: demoUser.id, role_key: 'gs_admin' }),
  )

  const { data: domainRows } = mustWrite(
    'external_domains insert',
    await supabase
    .from('external_domains')
    .insert(
      DOMAINS.map((d) => ({
        tenant_id: tenantId,
        domain: d.domain,
        classification: d.classification,
        business_owner: d.owner ?? null,
        review_date: d.classification === 'temporary' ? daysAgo(-30 + Math.floor(r() * 90)).slice(0, 10) : null,
        notes: d.classification === 'blocked' ? 'Contract terminated Q3 2025. All access must be removed.' : null,
        first_seen_at: daysAgo(90 + Math.floor(r() * 600)),
        last_seen_at: daysAgo(0.2),
      })),
    )
    .select('id,domain,classification'),
  )
  const domainById = new Map((domainRows ?? []).map((d) => [d.domain as string, d]))

  // External organizations: one per domain, except a few deliberately grouped
  // so the multi-domain organization model is visible in the demo.
  const ORG_GROUPS: Record<string, string> = {
    'pinecrest-medical.com': 'Aurora Health Systems',
    'aurorahealthsystems.org': 'Aurora Health Systems',
    'gmail.com': 'Personal email (consumer)',
    'outlook.com': 'Personal email (consumer)',
    'hotmail.com': 'Personal email (consumer)',
  }
  const orgSpecs = new Map<string, { name: string; domains: string[]; classification: DomainClassification; owner: string | null }>()
  for (const d of DOMAINS) {
    const name = ORG_GROUPS[d.domain] ?? companyNameFor(d.domain)
    const spec = orgSpecs.get(name) ?? { name, domains: [], classification: d.classification, owner: d.owner ?? null }
    spec.domains.push(d.domain)
    if (!spec.owner && d.owner) spec.owner = d.owner
    orgSpecs.set(name, spec)
  }
  const orgInserts = Array.from(orgSpecs.values()).map((spec) => ({
    tenant_id: tenantId,
    name: spec.name,
    relationship_type: spec.classification === 'approved_partner' ? 'partner' : spec.classification,
    approval_state: spec.classification === 'blocked' ? 'blocked' : spec.classification === 'unknown' ? 'unreviewed' : spec.classification === 'temporary' ? 'restricted' : 'approved',
    business_owner: spec.owner,
    business_owner_email: spec.owner ? `${spec.owner.toLowerCase().replace(/\s+/g, '.')}@northwindhealth.com` : null,
    review_date: spec.classification === 'temporary' ? daysAgo(-30 + Math.floor(r() * 90)).slice(0, 10) : null,
    notes: spec.classification === 'blocked' ? 'Contract terminated Q3 2025. All access must be removed.' : null,
    seed_domain_id: domainById.get(spec.domains[0])?.id ?? null,
    first_seen_at: daysAgo(90 + Math.floor(r() * 600)),
    last_seen_at: daysAgo(0.2),
  }))
  const { data: orgRows } = mustWrite(
    'external_organizations insert',
    await supabase.from('external_organizations').insert(orgInserts).select('id,name,relationship_type'),
  )
  const orgByDomain = new Map<string, { id: string; relationship_type: RelationshipType }>()
  for (const o of orgRows ?? []) {
    const spec = orgSpecs.get(o.name as string)
    for (const domain of spec?.domains ?? []) {
      orgByDomain.set(domain, { id: o.id as string, relationship_type: o.relationship_type as RelationshipType })
      mustWrite(
        'external_domains link organization',
        await supabase.from('external_domains').update({ organization_id: o.id }).eq('id', domainById.get(domain)!.id),
      )
    }
  }

  const internalOwners = Array.from({ length: 12 }, (_, i) => ({ id: `owner-${i}`, displayName: `${FIRST[(i * 7) % FIRST.length]} ${LAST[(i * 11) % LAST.length]}`, mail: `${FIRST[(i * 7) % FIRST.length].toLowerCase()}.${LAST[(i * 11) % LAST.length].toLowerCase()}@northwindhealth.com` }))
  const { data: resourceRows } = mustWrite(
    'resources insert',
    await supabase
    .from('resources')
    .insert(
      RESOURCES.map((res, i) => {
        const sens = detectSensitivity(res.name, res.desc)
        return {
          tenant_id: tenantId,
          ms_object_id: `demo-res-${i}`,
          resource_type: res.type,
          display_name: res.name,
          description: res.desc ?? null,
          visibility: res.visibility ?? null,
          web_url: res.type === 'enterprise_app' ? `https://${res.name.toLowerCase().replace(/\s+/g, '')}.example.com` : null,
          is_sensitive: sens.isSensitive,
          sensitivity_category: sens.category,
          internal_member_count: 4 + Math.floor(r() * 60),
          owners: [internalOwners[i % internalOwners.length], internalOwners[(i + 5) % internalOwners.length]],
          first_seen_at: daysAgo(95),
        }
      }),
    )
    .select('id,display_name,resource_type,is_sensitive'),
  )
  const resources = resourceRows ?? []

  // SharePoint sites for teams and M365 groups
  const groupsWithSites = resources.filter((x) => x.resource_type === 'team' || x.resource_type === 'm365_group')
  const { data: siteRows } = mustWrite(
    'resources sharepoint insert',
    await supabase
    .from('resources')
    .insert(
      groupsWithSites.map((grp, i) => ({
        tenant_id: tenantId,
        ms_object_id: `demo-site-${i}`,
        resource_type: 'sharepoint_site',
        display_name: grp.display_name,
        web_url: `https://northwindhealth.sharepoint.com/sites/${(grp.display_name as string).replace(/[^a-z0-9]+/gi, '')}`,
        is_sensitive: grp.is_sensitive,
        sensitivity_category: detectSensitivity(grp.display_name as string).category,
        linked_resource_id: grp.id,
        first_seen_at: daysAgo(95),
      })),
    )
    .select('id,linked_resource_id'),
  )
  const siteByGroup = new Map((siteRows ?? []).map((s) => [s.linked_resource_id as string, s.id as string]))

  const sponsors = internalOwners.map((o, i) => ({ ...o, enabled: i !== 3 && i !== 9 }))
  const guestCount = 186
  const guests: Record<string, unknown>[] = []
  const guestPlans: { domain: string; sensitiveBias: number; count: number }[] = []
  for (let i = 0; i < guestCount; i++) {
    const d = pickWeighted(DOMAINS, r)
    const first = FIRST[Math.floor(r() * FIRST.length)]
    const last = LAST[Math.floor(r() * LAST.length)]
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i % 7 === 0 ? i : ''}@${d.domain}`
    const ageDays = Math.floor(r() * 1100) + 5
    const roll = r()
    let lastSignIn: string | null
    if (roll < 0.14) lastSignIn = null
    else if (roll < 0.42) lastSignIn = daysAgo(Math.floor(r() * 30))
    else if (roll < 0.62) lastSignIn = daysAgo(30 + Math.floor(r() * 60))
    else if (roll < 0.8) lastSignIn = daysAgo(90 + Math.floor(r() * 90))
    else lastSignIn = daysAgo(180 + Math.floor(r() * Math.min(ageDays, 700)))
    const pending = lastSignIn === null && r() < 0.6
    const sponsorRoll = r()
    const sponsor = sponsorRoll < 0.22 ? null : sponsors[Math.floor(r() * sponsors.length)]
    const disabled = r() < 0.06
    const reviewed = r() < 0.3
    const sensitiveBias = d.classification === 'blocked' ? 0.5 : d.classification === 'unknown' ? 0.2 : 0.3
    const count = d.classification === 'unknown' ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * (r() < 0.1 ? 12 : 5))
    guestPlans.push({ domain: d.domain, sensitiveBias, count })
    const upn = `${email.replace('@', '_')}#EXT#@northwind.onmicrosoft.com`
    const companyName = companyNameFor(d.domain)
    const jobTitle = d.classification === 'contractor' ? (r() < 0.6 ? 'Contract Engineer' : 'Consultant') : null
    const org = orgByDomain.get(d.domain) ?? null
    const classification = classifyExternalIdentity({
      userType: 'Guest',
      userPrincipalName: upn,
      mail: email,
      externalUserState: pending ? 'PendingAcceptance' : 'Accepted',
      companyName,
      jobTitle,
      creationType: 'Invitation',
      domain: d.domain,
      tenantVerifiedDomains: ['northwindhealth.com', 'northwind.onmicrosoft.com'],
      organizationRelationship: org?.relationship_type ?? null,
    })
    const id = crypto.randomUUID()
    guests.push({
      id,
      identity_id: id,
      tenant_id: tenantId,
      ms_object_id: `demo-guest-${i}`,
      display_name: `${first} ${last}`,
      email,
      upn,
      domain: d.domain,
      external_domain_id: domainById.get(d.domain)?.id ?? null,
      external_organization_id: org?.id ?? null,
      identity_class: 'external',
      external_type: classification.external_type,
      classification_evidence: classification.evidence,
      company_name: companyName,
      account_enabled: !disabled,
      invitation_status: pending ? 'PendingAcceptance' : 'Accepted',
      created_at_ms: daysAgo(ageDays),
      last_sign_in_at: pending ? null : lastSignIn,
      last_non_interactive_sign_in_at: pending || !lastSignIn ? null : daysAgo(Math.max(0, Math.floor((Date.now() - new Date(lastSignIn).getTime()) / 86_400_000) - Math.floor(r() * 5))),
      auth_methods: pending ? [] : r() < 0.7 ? ['microsoftAuthenticatorAuthenticationMethod', 'passwordAuthenticationMethod'] : r() < 0.5 ? ['phoneAuthenticationMethod'] : [],
      sponsor_ms_object_id: sponsor?.id ?? null,
      sponsor_display_name: sponsor?.displayName ?? null,
      sponsor_email: sponsor?.mail ?? null,
      sponsor_enabled: sponsor ? sponsor.enabled : null,
      review_status: reviewed ? 'approved' : 'never_reviewed',
      last_reviewed_at: reviewed ? daysAgo(Math.floor(r() * 400)) : null,
      first_seen_at: daysAgo(Math.min(95, ageDays)),
      last_seen_at: daysAgo(0.2),
    })
  }
  const hubs = guests.map((g) => hubRowsFromGuest(g as GuestHubSource))
  for (let i = 0; i < hubs.length; i += 100) {
    mustWrite('identities insert', await supabase.from('identities').insert(hubs.slice(i, i + 100).map((h) => h.identity)))
  }
  for (let i = 0; i < hubs.length; i += 100) {
    mustWrite('identity_accounts insert', await supabase.from('identity_accounts').insert(hubs.slice(i, i + 100).map((h) => h.account)))
  }
  const insertedGuests: { id: string; ms_object_id: string; identity_id: string }[] = []
  for (let i = 0; i < guests.length; i += 100) {
    const { data } = mustWrite(
      'guest_identities insert',
      await supabase.from('guest_identities').insert(guests.slice(i, i + 100)).select('id,ms_object_id,identity_id'),
    )
    insertedGuests.push(...((data ?? []) as { id: string; ms_object_id: string; identity_id: string }[]))
  }
  insertedGuests.sort((a, b) => Number(a.ms_object_id.split('-').pop()) - Number(b.ms_object_id.split('-').pop()))

  const maps = await loadGovernanceMaps(tenantId, insertedGuests)
  const sensitiveResources = resources.filter((x) => x.is_sensitive && x.resource_type !== 'sharepoint_site')
  const normalResources = resources.filter((x) => !x.is_sensitive && x.resource_type !== 'sharepoint_site')
  const memberships: Record<string, unknown>[] = []
  const extCounts = new Map<string, number>()
  insertedGuests.forEach((g, i) => {
    const plan = guestPlans[i]
    const chosen = new Set<string>()
    for (let k = 0; k < plan.count; k++) {
      const pool = r() < plan.sensitiveBias ? sensitiveResources : normalResources
      const res = pool[Math.floor(r() * pool.length)]
      if (chosen.has(res.id)) continue
      chosen.add(res.id)
      const isOwner = r() < 0.05
      const firstSeen = daysAgo(Math.floor(r() * 90))
      memberships.push(withMembershipIds({ tenant_id: tenantId, guest_id: g.id, resource_id: res.id, membership_type: isOwner ? 'owner' : 'member', first_seen_at: firstSeen }, maps))
      extCounts.set(res.id, (extCounts.get(res.id) ?? 0) + 1)
      const site = siteByGroup.get(res.id)
      if (site) {
        memberships.push(withMembershipIds({ tenant_id: tenantId, guest_id: g.id, resource_id: site, membership_type: 'member', first_seen_at: firstSeen }, maps))
        extCounts.set(site, (extCounts.get(site) ?? 0) + 1)
      }
    }
  })
  for (let i = 0; i < memberships.length; i += 200) {
    mustWrite('resource_memberships insert', await supabase.from('resource_memberships').insert(memberships.slice(i, i + 200)))
  }
  for (const [rid, n] of extCounts) {
    mustWrite('resources member count', await supabase.from('resources').update({ external_member_count: n }).eq('id', rid))
  }

  // Activity timeline samples
  const activity = insertedGuests.slice(0, 120).flatMap((g, i) => [
    withIdentityId({ tenant_id: tenantId, guest_id: g.id, activity_type: 'scanned', occurred_at: daysAgo(0.2), details: { scan: 'daily' } }, maps),
    withIdentityId({ tenant_id: tenantId, guest_id: g.id, activity_type: 'membership_added', occurred_at: daysAgo(10 + (i % 60)), details: { resource: RESOURCES[i % RESOURCES.length].name } }, maps),
    ...(guests[i].last_sign_in_at ? [withIdentityId({ tenant_id: tenantId, guest_id: g.id, activity_type: 'sign_in', occurred_at: guests[i].last_sign_in_at as string, details: { app: ['Microsoft Teams', 'SharePoint Online', 'Outlook'][i % 3] } }, maps)] : []),
  ])
  for (let i = 0; i < activity.length; i += 200) {
    mustWrite('guest_activity insert', await supabase.from('guest_activity').insert(activity.slice(i, i + 200)))
  }

  // Policies
  mustWrite(
    'policies insert',
    await supabase.from('policies').insert([
    { tenant_id: tenantId, name: 'Inactive guests (90 days)', description: 'Flag guests with no sign-in activity for 90 days.', rule_type: 'inactive_days', config: { days: 90 }, action: 'flag', severity: 'medium', is_system: true },
    { tenant_id: tenantId, name: 'Stale guests (180 days)', description: 'Recommend removal for guests inactive 180+ days.', rule_type: 'inactive_days', config: { days: 180 }, action: 'recommend_removal', severity: 'high', is_system: true },
    { tenant_id: tenantId, name: 'Invitation never accepted', description: 'Flag invitations pending for more than 30 days.', rule_type: 'never_signed_in', config: { days: 30 }, action: 'recommend_removal', severity: 'medium', is_system: true },
    { tenant_id: tenantId, name: 'No sponsor assigned', description: 'Every guest must have an internal sponsor.', rule_type: 'no_sponsor', config: {}, action: 'flag', severity: 'medium', is_system: true },
    { tenant_id: tenantId, name: 'Sponsor disabled', description: 'Guest sponsor has left the organization.', rule_type: 'sponsor_disabled', config: {}, action: 'create_review', severity: 'high', is_system: true },
    { tenant_id: tenantId, name: 'Blocked domain access', description: 'Any guest from a blocked domain must be removed.', rule_type: 'unapproved_domain', config: { classifications: ['blocked'] }, action: 'recommend_removal', severity: 'critical', is_system: true },
    { tenant_id: tenantId, name: 'Annual access review', description: 'Guests must be reviewed at least every 365 days.', rule_type: 'no_recent_review', config: { days: 365 }, action: 'create_review', severity: 'low', is_system: true },
    { tenant_id: tenantId, name: 'Temporary engagements expired', description: 'Temporary-domain guests past their review date.', rule_type: 'expired_temporary', config: {}, action: 'recommend_removal', severity: 'high', is_system: false },
  ]),
  )

  // Score, findings, and 12 weeks of trend snapshots
  await rescoreTenant(tenantId, null)
  await generateFindings(tenantId)
  const base = await snapshotMetrics(tenantId, null)
  mustWrite('scan_results delete', await supabase.from('scan_results').delete().eq('tenant_id', tenantId))
  const history = Array.from({ length: 13 }, (_, w) => {
    const weeksAgo = 12 - w
    const drift = 1 + weeksAgo * 0.018
    const snap = {
      ...base,
      total_guests: Math.round(base.total_guests * (1 + weeksAgo * 0.012)),
      critical: Math.round(base.critical * drift * 1.15),
      high: Math.round(base.high * drift),
      medium: Math.round(base.medium * (1 + weeksAgo * 0.004)),
      inactive_90: Math.round(base.inactive_90 * drift),
      unknown_domains: Math.min(base.domains, base.unknown_domains + Math.floor(weeksAgo / 4)),
    }
    return { tenant_id: tenantId, snapshot: snap, created_at: daysAgo(weeksAgo * 7 + 0.2) }
  })
  mustWrite('scan_results insert', await supabase.from('scan_results').insert(history))

  // Scan history
  mustWrite(
    'scan_jobs insert',
    await supabase.from('scan_jobs').insert(
      Array.from({ length: 8 }, (_, i) => ({
        tenant_id: tenantId,
        scan_type: i === 7 ? 'initial_full' : 'scheduled',
        status: 'completed',
        progress: { percent: 100, phase: 'diff' },
        started_by: i === 7 ? demoUser.id : null,
        started_at: daysAgo(i + 0.21),
        completed_at: daysAgo(i + 0.2),
        summary: { ...base, guests: base.total_guests - i, groups: RESOURCES.length, new_guests: i === 0 ? 3 : Math.floor(r() * 4), removed_guests: Math.floor(r() * 2) },
      })),
    ),
  )

  // Access review in flight
  const { data: review } = mustWrite(
    'access_reviews insert',
    await supabase
      .from('access_reviews')
      .insert({ tenant_id: tenantId, name: 'Q2 Finance & HR guest review', description: 'Quarterly certification of external access to finance and HR resources.', status: 'active', scope: { sensitivity: ['finance', 'hr'] }, created_by: demoUser.id, due_at: daysAgo(-9), created_at: daysAgo(5) })
      .select('id')
      .single(),
  )
  if (!review?.id) throw new Error('access_reviews insert: missing id')
  const sensitiveIds = new Set(resources.filter((x) => x.is_sensitive).map((x) => x.id))
  const financeHrGuests = Array.from(new Set(memberships.filter((m) => sensitiveIds.has(m.resource_id as string)).map((m) => m.guest_id as string))).slice(0, 24)
  const resourceById = new Map(resources.map((x) => [x.id, x]))
  const reviewItems = financeHrGuests.map((gid, i) => {
    const snap = memberships.filter((m) => m.guest_id === gid && resourceById.has(m.resource_id as string)).map((m) => {
      const res = resourceById.get(m.resource_id as string)!
      return { id: res.id, name: res.display_name, type: res.resource_type, sensitive: res.is_sensitive }
    })
    const decided = i < 9
    const decision = decided ? (['approve', 'remove', 'approve', 'extend', 'remove', 'approve', 'investigate', 'approve', 'remove'] as const)[i] : null
    return withIdentityId({ tenant_id: tenantId, review_id: review.id, guest_id: gid, status: decided ? 'decided' : 'pending', decision, resources_snapshot: snap, decided_at: decided ? daysAgo(4 - i * 0.3) : null }, maps)
  })
  mustWrite('review_items insert', await supabase.from('review_items').insert(reviewItems))
  mustWrite(
    'guest_identities review_status',
    await supabase.from('guest_identities').update({ review_status: 'pending' }).in('id', financeHrGuests.slice(9)),
  )

  // Alerts and audit history
  const blockedGuests = insertedGuests.filter((_, i) => guestPlans[i].domain === 'ex-vendor-stratus.com')
  mustWrite(
    'alerts insert',
    await supabase.from('alerts').insert([
    ...blockedGuests.slice(0, 3).map((g) => withIdentityId({ tenant_id: tenantId, alert_type: 'blocked_domain_access', severity: 'critical', title: 'Guest from blocked domain still has access', description: 'ex-vendor-stratus.com was blocked after contract termination.', guest_id: g.id }, maps)),
    { tenant_id: tenantId, alert_type: 'new_sensitive_access', severity: 'high', title: '3 new guests added to Board Materials', description: 'Detected in the last scan. Sponsors notified.', resource_id: resources.find((x) => x.display_name === 'Board Materials')?.id },
    { tenant_id: tenantId, alert_type: 'sponsor_disabled', severity: 'medium', title: 'Sponsor account disabled for 11 guests', description: 'Sponsor Dev Patel left the organization. Reassign or review these guests.' },
  ]),
  )
  const auditRows = [
    { action: 'tenant.connected', target_type: 'tenant', target_label: 'Northwind Health', created_at: daysAgo(96) },
    { action: 'scan.started', target_type: 'scan_job', target_label: 'Initial full scan', created_at: daysAgo(95.9) },
    { action: 'scan.completed', target_type: 'scan_job', target_label: 'Initial full scan', new_state: { guests: 171 }, created_at: daysAgo(95.5) },
    { action: 'domain.classified', target_type: 'external_domain', target_label: 'meridianlaw.com', previous_state: { classification: 'unknown' }, new_state: { classification: 'approved_partner' }, created_at: daysAgo(80) },
    { action: 'domain.classified', target_type: 'external_domain', target_label: 'ex-vendor-stratus.com', previous_state: { classification: 'vendor' }, new_state: { classification: 'blocked' }, reason: 'Contract terminated', created_at: daysAgo(41) },
    { action: 'policy.updated', target_type: 'policy', target_label: 'Stale guests (180 days)', previous_state: { days: 365 }, new_state: { days: 180 }, created_at: daysAgo(33) },
    { action: 'review.created', target_type: 'access_review', target_label: 'Q2 Finance & HR guest review', created_at: daysAgo(5) },
    { action: 'review.decided', target_type: 'review_item', target_label: 'Approve · 3 guests', created_at: daysAgo(3) },
    { action: 'remediation.executed', target_type: 'guest', target_label: 'tallgrassaudit.com · 4 guests removed', new_state: { removed: 4 }, reason: 'Audit engagement ended', created_at: daysAgo(2) },
    { action: 'scan.completed', target_type: 'scan_job', target_label: 'Scheduled scan', new_state: base, created_at: daysAgo(0.2) },
  ].map((a) => ({ tenant_id: tenantId, actor_user_id: demoUser.id, actor_email: a.action.startsWith('scan.completed') ? 'system' : demoUser.email, source_ip: '203.0.113.42', ...a }))
  mustWrite('audit_events insert', await supabase.from('audit_events').insert(auditRows))

  return tenantId
}
