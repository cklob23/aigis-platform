import 'server-only'
import { db } from '@/lib/supabase/admin'
import { fetchAllById } from '@/lib/supabase/page'
import { parsePrivilegedSettings } from '@/lib/privileged/capability'
import { requirePrivilegedDetail, type RoleKey } from '@/lib/auth/rbac'
import { DEMO_ACTIVATIONS_BY_EMAIL } from '@/lib/demo/privileged-activations'
import { GLOBAL_ADMIN_TEMPLATE_ID } from '@/lib/risk/privileged'
import { guestRiskFromGuest } from '@/lib/privileged/score'
import {
  activatedRoleKeysFromActivations,
  buildPrivilegedProfile,
  parseStoredActivations,
  type PrivilegedIdentityProfile,
} from '@/lib/privileged/profile'
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
import type { IdentityOwnerKind, RecommendedAction, RiskFactor } from '@/lib/types'

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

type GuestRiskQueryRow = {
  identity_id: string
  invitation_status: string | null
  created_at_ms: string | null
  last_sign_in_at: string | null
  last_non_interactive_sign_in_at: string | null
  sponsor_ms_object_id: string | null
  sponsor_display_name: string | null
  sponsor_email: string | null
  sponsor_enabled: boolean | null
  auth_methods: string[] | null
  risk_factors: RiskFactor[] | null
  last_reviewed_at: string | null
}

function authMethodsFromAttrs(attrs: Record<string, unknown> | null): string[] | null {
  const raw = attrs?.auth_methods
  if (!Array.isArray(raw)) return null
  return raw.filter((row): row is string => typeof row === 'string')
}

async function countGlobalAdminPrincipals(tenantId: string) {
  const supabase = db()
  const { data: gaRoles, error: roleError } = await supabase
    .from('directory_roles')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('template_id', GLOBAL_ADMIN_TEMPLATE_ID)
    .is('removed_at', null)
  if (roleError) throw roleError
  const roleIds = (gaRoles ?? []).map((row) => row.id as string)
  if (roleIds.length === 0) return 0
  const { data: rows, error } = await supabase
    .from('role_assignments')
    .select('principal_identity_id')
    .eq('tenant_id', tenantId)
    .in('directory_role_id', roleIds)
    .is('removed_at', null)
    .not('principal_identity_id', 'is', null)
  if (error) throw error
  return new Set((rows ?? []).map((row) => row.principal_identity_id as string)).size
}

async function loadPrivilegedRows(tenantId: string, settings: Record<string, unknown> | null | undefined) {
  const supabase = db()
  const pimAvailable = parsePrivilegedSettings(settings).capability?.pim === 'available'
  const [identities, assignments, roles, findings, accounts] = await Promise.all([
    fetchAllById<IdentityQueryRow>('identities privileged', () =>
      supabase
        .from('identities')
        .select(
          'id,display_name,primary_email,identity_class,is_privileged,privilege_tier,last_reviewed_at,last_activity_at,risk_score,risk_level,status,owner_display_name,owner_kind,owner_identity_id,first_seen_at',
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
    const storedActivations = parseStoredActivations(attrs?.pim_activations)
    return {
      ...row,
      owner_display_name: row.owner_display_name ?? null,
      owner_kind: row.owner_kind ?? null,
      dedicated_admin: Boolean(attrs?.dedicated_admin),
      auth_methods: authMethodsFromAttrs(attrs),
      app_id: row.identity_class === 'non_human' ? attrAppId ?? account?.source_object_id ?? null : null,
      activatedRoleKeys: activatedRoleKeysFromActivations(storedActivations),
    }
  })

  const externalIds = patchedIdentities.filter((row) => row.identity_class === 'external').map((row) => row.id)
  const guestRows =
    externalIds.length === 0
      ? []
      : await fetchAllById<GuestRiskQueryRow>('guest_identities privileged', () =>
          supabase
            .from('guest_identities')
            .select(
              'identity_id,invitation_status,created_at_ms,last_sign_in_at,last_non_interactive_sign_in_at,sponsor_ms_object_id,sponsor_display_name,sponsor_email,sponsor_enabled,auth_methods,risk_factors,last_reviewed_at',
            )
            .eq('tenant_id', tenantId)
            .in('identity_id', externalIds)
            .is('removed_at', null),
        )
  const guestByIdentity = new Map(guestRows.map((row) => [row.identity_id, row]))
  for (const row of patchedIdentities) {
    const guest = guestByIdentity.get(row.id)
    if (!guest) continue
    row.guestRisk = guestRiskFromGuest(guest)
    row.storedGuestFactors = Array.isArray(guest.risk_factors) ? (guest.risk_factors as RiskFactor[]) : []
    if (Array.isArray(guest.auth_methods) && guest.auth_methods.length) row.auth_methods = guest.auth_methods
    if (guest.last_sign_in_at) row.last_activity_at = guest.last_sign_in_at
  }

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
      'id,display_name,primary_email,identity_class,is_privileged,privilege_tier,last_reviewed_at,last_activity_at,risk_score,risk_level,status,owner_display_name,owner_kind,owner_identity_id,recommended_action,first_seen_at',
    )
    .eq('tenant_id', tenantId)
    .eq('id', identityId)
    .is('removed_at', null)
    .eq('is_privileged', true)
    .maybeSingle()
  if (!identity) return null

  const [assignments, roles, accounts, reviews, remediations, explanation, globalAdminCount, guestRow] = await Promise.all([
    fetchAllById<PrivilegedAssignmentRow>('role_assignments identity', () =>
      supabase
        .from('role_assignments')
        .select('id,principal_identity_id,assignment_type,member_type,pim_status,starts_at,ends_at,directory_scope_id,directory_role_id')
        .eq('tenant_id', tenantId)
        .eq('principal_identity_id', identityId)
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
    countGlobalAdminPrincipals(tenantId),
    identity.identity_class === 'external'
      ? supabase
          .from('guest_identities')
          .select(
            'identity_id,invitation_status,created_at_ms,last_sign_in_at,last_non_interactive_sign_in_at,sponsor_ms_object_id,sponsor_display_name,sponsor_email,sponsor_enabled,auth_methods,risk_factors,last_reviewed_at',
          )
          .eq('tenant_id', tenantId)
          .eq('identity_id', identityId)
          .is('removed_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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

  const guest = (guestRow.data ?? null) as GuestRiskQueryRow | null
  return buildPrivilegedProfile({
    identity: {
      id: identity.id as string,
      display_name: (identity.display_name as string | null) ?? null,
      primary_email: (identity.primary_email as string | null) ?? null,
      identity_class: identity.identity_class as PrivilegedIdentityRow['identity_class'],
      is_privileged: true,
      privilege_tier: (identity.privilege_tier as 0 | 1 | 2 | null) ?? null,
      last_reviewed_at: (identity.last_reviewed_at as string | null) ?? null,
      last_activity_at: (guest?.last_sign_in_at as string | null) ?? (identity.last_activity_at as string | null) ?? null,
      risk_score: Number(identity.risk_score ?? 0),
      risk_level: identity.risk_level as PrivilegedIdentityRow['risk_level'],
      status: identity.status as string,
      owner_display_name: (identity.owner_display_name as string | null) ?? null,
      dedicated_admin: Boolean(attrs?.dedicated_admin),
      auth_methods: guest?.auth_methods ?? authMethodsFromAttrs(attrs),
      app_id: identity.identity_class === 'non_human' ? (typeof attrs?.appId === 'string' ? attrs.appId : account?.source_object_id ?? null) : null,
      recommended_action: (identity.recommended_action as RecommendedAction | null) ?? null,
      owner_kind: (identity.owner_kind as IdentityOwnerKind | null) ?? null,
      owner_identity_id: (identity.owner_identity_id as string | null) ?? null,
      first_seen_at: (identity.first_seen_at as string | null) ?? null,
      ms_object_id: account?.source_object_id ?? null,
      guestRisk: guest ? guestRiskFromGuest(guest) : null,
      storedGuestFactors: guest?.risk_factors ?? null,
      activatedRoleKeys: activatedRoleKeysFromActivations(activations),
    },
    assignments,
    roles,
    pimAvailable,
    globalAdminCount,
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
