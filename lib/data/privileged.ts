import 'server-only'
import { db } from '@/lib/supabase/admin'
import { fetchAllById } from '@/lib/supabase/page'
import { parsePrivilegedSettings } from '@/lib/privileged/capability'
import { requirePrivilegedDetail, type RoleKey } from '@/lib/auth/rbac'
import { DEMO_ACTIVATIONS_BY_EMAIL } from '@/lib/demo/privileged-activations'
import { buildPrivilegedProfile, parseStoredActivations, type PrivilegedIdentityProfile } from '@/lib/privileged/profile'
import {
  buildHighestRiskHolders,
  buildPrivilegedHolders,
  buildPrivilegedRoles,
  summarizePrivileged,
  type PrivilegedAssignmentRow,
  type PrivilegedDetail,
  type PrivilegedFindingCount,
  type PrivilegedIdentityRow,
  type PrivilegedRoleRow,
  type PrivilegedSummary,
} from '@/lib/privileged/view'
import type { IdentityOwnerKind, RecommendedAction } from '@/lib/types'

type IdentityQueryRow = PrivilegedIdentityRow & { owner_display_name?: string | null }
type AssignmentQueryRow = PrivilegedAssignmentRow & { removed_at?: string | null }
type RoleQueryRow = PrivilegedRoleRow
type FindingQueryRow = { finding_type: string; title: string; identity_id: string | null }
type AccountQueryRow = {
  identity_id: string
  account_kind: string | null
  source_object_id: string | null
  attrs: Record<string, unknown> | null
}

function authMethodsFromAttrs(attrs: Record<string, unknown> | null): string[] | null {
  const raw = attrs?.auth_methods
  if (!Array.isArray(raw)) return null
  return raw.filter((row): row is string => typeof row === 'string')
}

async function loadPrivilegedRows(tenantId: string, settings: Record<string, unknown> | null | undefined) {
  const supabase = db()
  const pimAvailable = parsePrivilegedSettings(settings).capability?.pim === 'available'
  const [identities, assignments, roles, findings, accounts] = await Promise.all([
    fetchAllById<IdentityQueryRow>('identities privileged', () =>
      supabase
        .from('identities')
        .select(
          'id,display_name,primary_email,identity_class,is_privileged,privilege_tier,last_reviewed_at,last_activity_at,risk_score,risk_level,status,owner_display_name,owner_kind',
        )
        .eq('tenant_id', tenantId)
        .is('removed_at', null)
        .eq('is_privileged', true),
    ),
    fetchAllById<AssignmentQueryRow>('role_assignments privileged', () =>
      supabase
        .from('role_assignments')
        .select(
          'id,principal_identity_id,assignment_type,member_type,pim_status,starts_at,ends_at,directory_scope_id,directory_role_id',
        )
        .eq('tenant_id', tenantId)
        .is('removed_at', null),
    ),
    fetchAllById<RoleQueryRow>('directory_roles privileged', () =>
      supabase
        .from('directory_roles')
        .select('id,display_name,privilege_tier,is_privileged,is_built_in,description,template_id')
        .eq('tenant_id', tenantId)
        .is('removed_at', null),
    ),
    fetchAllById<FindingQueryRow>('risk_findings privileged', () =>
      supabase.from('risk_findings').select('finding_type,title,identity_id').eq('tenant_id', tenantId).eq('status', 'open'),
    ),
    fetchAllById<AccountQueryRow>('identity_accounts privileged', () =>
      supabase
        .from('identity_accounts')
        .select('identity_id,account_kind,source_object_id,attrs')
        .eq('tenant_id', tenantId)
        .eq('source', 'entra')
        .is('removed_at', null),
    ),
  ])

  const accountByIdentity = new Map<string, AccountQueryRow>()
  for (const row of accounts) {
    const current = accountByIdentity.get(row.identity_id)
    if (!current || row.account_kind === 'user' || row.account_kind === 'guest') {
      accountByIdentity.set(row.identity_id, row)
    }
  }

  const patchedIdentities: PrivilegedIdentityRow[] = identities.map((row) => {
    const account = accountByIdentity.get(row.id)
    const attrs = account?.attrs ?? null
    const attrAppId = attrs && typeof attrs.appId === 'string' ? attrs.appId : typeof attrs?.app_id === 'string' ? attrs.app_id : null
    return {
      ...row,
      owner_display_name: row.owner_display_name ?? null,
      owner_kind: row.owner_kind ?? null,
      dedicated_admin: Boolean(attrs?.dedicated_admin),
      auth_methods: authMethodsFromAttrs(attrs),
      app_id: row.identity_class === 'non_human' ? attrAppId ?? account?.source_object_id ?? null : null,
    }
  })

  const privilegedIds = new Set(patchedIdentities.map((row) => row.id))
  const findingCounts = new Map<string, PrivilegedFindingCount>()
  const topFactorByIdentity: Record<string, string> = {}
  for (const row of findings) {
    if (row.identity_id && !privilegedIds.has(row.identity_id)) continue
    const current = findingCounts.get(row.finding_type) ?? { finding_type: row.finding_type, title: row.title, count: 0 }
    current.count += 1
    findingCounts.set(row.finding_type, current)
    if (row.identity_id && !topFactorByIdentity[row.identity_id]) {
      topFactorByIdentity[row.identity_id] = row.title
    }
  }

  return {
    identities: patchedIdentities,
    assignments,
    roles,
    findings: Array.from(findingCounts.values()).sort((a, b) => b.count - a.count),
    topFactorByIdentity,
    pimAvailable,
  }
}

export async function getPrivilegedSummary(
  tenantId: string,
  settings: Record<string, unknown> | null | undefined,
): Promise<PrivilegedSummary> {
  const loaded = await loadPrivilegedRows(tenantId, settings)
  return summarizePrivileged(loaded.identities, loaded.assignments, loaded.roles, loaded.pimAvailable, loaded.findings)
}

export async function getPrivilegedDetail(
  tenantId: string,
  role: RoleKey,
  settings: Record<string, unknown> | null | undefined,
): Promise<PrivilegedDetail> {
  requirePrivilegedDetail(role)
  const loaded = await loadPrivilegedRows(tenantId, settings)
  const summary = summarizePrivileged(loaded.identities, loaded.assignments, loaded.roles, loaded.pimAvailable, loaded.findings)
  const holders = buildPrivilegedHolders(
    loaded.identities,
    loaded.assignments,
    loaded.roles,
    loaded.pimAvailable,
    loaded.topFactorByIdentity,
  )
  return {
    summary,
    holders,
    highestRisk: buildHighestRiskHolders(holders),
    roles: buildPrivilegedRoles(loaded.roles, loaded.assignments, loaded.identities, loaded.pimAvailable),
  }
}

export async function getPrivilegedIdentity(
  tenantId: string,
  role: RoleKey,
  settings: Record<string, unknown> | null | undefined,
  identityId: string,
  opts: { isDemo?: boolean } = {},
): Promise<PrivilegedIdentityProfile | null> {
  requirePrivilegedDetail(role)
  const supabase = db()
  const pimAvailable = parsePrivilegedSettings(settings).capability?.pim === 'available'

  const { data: identity } = await supabase
    .from('identities')
    .select(
      'id,display_name,primary_email,identity_class,is_privileged,privilege_tier,last_reviewed_at,last_activity_at,risk_score,risk_level,status,owner_display_name,owner_kind,recommended_action,first_seen_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', identityId)
    .is('removed_at', null)
    .eq('is_privileged', true)
    .maybeSingle()
  if (!identity) return null

  const [assignments, roles, accounts, reviews, remediations, explanation] = await Promise.all([
    fetchAllById<PrivilegedAssignmentRow>('role_assignments identity', () =>
      supabase
        .from('role_assignments')
        .select('id,principal_identity_id,assignment_type,member_type,pim_status,starts_at,ends_at,directory_scope_id,directory_role_id')
        .eq('tenant_id', tenantId)
        .is('removed_at', null),
    ),
    fetchAllById<PrivilegedRoleRow>('directory_roles identity', () =>
      supabase
        .from('directory_roles')
        .select('id,display_name,privilege_tier,is_privileged,is_built_in,description,template_id')
        .eq('tenant_id', tenantId)
        .is('removed_at', null),
    ),
    fetchAllById<AccountQueryRow>('identity_accounts identity', () =>
      supabase
        .from('identity_accounts')
        .select('identity_id,account_kind,source_object_id,attrs')
        .eq('tenant_id', tenantId)
        .eq('identity_id', identityId)
        .eq('source', 'entra')
        .is('removed_at', null),
    ),
    supabase
      .from('review_items')
      .select('id,status,decision,decided_at,review:access_reviews(id,name,status,due_at)')
      .eq('tenant_id', tenantId)
      .eq('identity_id', identityId)
      .order('created_at', { ascending: false }),
    supabase
      .from('remediation_actions')
      .select('id,action_type,status,created_at')
      .eq('tenant_id', tenantId)
      .eq('identity_id', identityId)
      .order('created_at', { ascending: false }),
    supabase
      .from('recommendation_explanations')
      .select('explanation,created_at')
      .eq('tenant_id', tenantId)
      .eq('identity_id', identityId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const account = accounts.find((row) => row.account_kind === 'user' || row.account_kind === 'guest') ?? accounts[0]
  const attrs = account?.attrs ?? null
  const storedActivations = parseStoredActivations(attrs?.pim_activations)
  const demoActivations = opts.isDemo ? DEMO_ACTIVATIONS_BY_EMAIL[identity.primary_email as string] ?? [] : []
  const activations = storedActivations.length ? storedActivations : demoActivations

  const reviewRows = (reviews.data ?? []).map((row) => {
    const review = row.review as unknown as { id: string; name: string; status: string; due_at: string | null } | null
    return {
      id: (review?.id as string) ?? (row.id as string),
      name: review?.name ?? 'Access review',
      status: (row.status as string) ?? review?.status ?? 'pending',
      decision: (row.decision as string | null) ?? null,
      dueAt: review?.due_at ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
    }
  })
  const requestRows = (remediations.data ?? []).map((row) => ({
    id: row.id as string,
    actionType: row.action_type as string,
    status: row.status as string,
    createdAt: row.created_at as string,
  }))

  return buildPrivilegedProfile({
    identity: {
      id: identity.id as string,
      display_name: (identity.display_name as string | null) ?? null,
      primary_email: (identity.primary_email as string | null) ?? null,
      identity_class: identity.identity_class as PrivilegedIdentityRow['identity_class'],
      is_privileged: true,
      privilege_tier: (identity.privilege_tier as 0 | 1 | 2 | null) ?? null,
      last_reviewed_at: (identity.last_reviewed_at as string | null) ?? null,
      last_activity_at: (identity.last_activity_at as string | null) ?? null,
      risk_score: Number(identity.risk_score ?? 0),
      risk_level: identity.risk_level as PrivilegedIdentityRow['risk_level'],
      status: identity.status as string,
      owner_display_name: (identity.owner_display_name as string | null) ?? null,
      dedicated_admin: Boolean(attrs?.dedicated_admin),
      auth_methods: authMethodsFromAttrs(attrs),
      app_id: identity.identity_class === 'non_human' ? (typeof attrs?.appId === 'string' ? attrs.appId : account?.source_object_id ?? null) : null,
      recommended_action: (identity.recommended_action as RecommendedAction | null) ?? null,
      owner_kind: (identity.owner_kind as IdentityOwnerKind | null) ?? null,
      first_seen_at: (identity.first_seen_at as string | null) ?? null,
      ms_object_id: account?.source_object_id ?? null,
    },
    assignments,
    roles,
    pimAvailable,
    activations,
    reviews: reviewRows,
    requests: requestRows,
    explanation: explanation.data
      ? { explanation: explanation.data.explanation as string, created_at: explanation.data.created_at as string }
      : null,
  })
}

export async function getIdentityPrivilegeTiers(
  tenantId: string,
  identityIds: string[],
): Promise<Record<string, 0 | 1 | 2>> {
  if (identityIds.length === 0) return {}
  const { data, error } = await db()
    .from('identities')
    .select('id,is_privileged,privilege_tier')
    .eq('tenant_id', tenantId)
    .in('id', identityIds)
    .eq('is_privileged', true)
  if (error) throw error
  const map: Record<string, 0 | 1 | 2> = {}
  for (const row of data ?? []) {
    if (row.privilege_tier === 0 || row.privilege_tier === 1 || row.privilege_tier === 2) {
      map[row.id as string] = row.privilege_tier
    }
  }
  return map
}
