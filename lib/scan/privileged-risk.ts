import 'server-only'
import { db } from '@/lib/supabase/admin'
import type { IdentityClass, IdentityOwnerKind } from '@/lib/types'
import { fetchAllById, type RangeQuery } from '@/lib/supabase/page'
import { parsePrivilegedSettings, privilegedStageEnabled } from '@/lib/privileged/capability'
import { parseStoredActivations } from '@/lib/privileged/profile'
import { GLOBAL_ADMIN_TEMPLATE_ID, type PrivilegedRiskContext } from '@/lib/risk/privileged'
import { privilegedIdsInSet } from '@/lib/privileged/ids'

type IdentityRow = {
  id: string
  identity_class: IdentityClass
  status: string
  last_reviewed_at: string | null
  last_activity_at: string | null
  owner_kind: IdentityOwnerKind | null
  owner_identity_id: string | null
  is_privileged: boolean
  privilege_tier: 0 | 1 | 2 | null
  first_seen_at: string | null
}

type AssignmentRow = {
  id: string
  principal_identity_id: string | null
  principal_ms_object_id: string
  directory_role_id: string
  assignment_type: 'active' | 'eligible'
  member_type: 'direct' | 'group' | 'inherited'
  directory_scope_id: string | null
  first_seen_at: string | null
}

type RoleRow = {
  id: string
  template_id: string | null
  display_name: string | null
  privilege_tier: 0 | 1 | 2 | null
  is_privileged: boolean
}

type AccountRow = {
  identity_id: string
  source_object_id: string
  account_kind: string
  enabled: boolean
  last_activity_at: string | null
  attrs: Record<string, unknown> | null
}

type ResourceRow = {
  ms_object_id: string
  owners: unknown
}

function scopedQuery<T>(query: unknown, column: string, identityIds?: string[]) {
  const next = identityIds
    ? (query as { in: (column: string, values: string[]) => unknown }).in(column, identityIds)
    : query
  return next as RangeQuery<T>
}

async function countTenantGlobalAdmins(tenantId: string, roles: RoleRow[]): Promise<number> {
  const gaRoleIds = roles
    .filter((row) => (row.template_id ?? '').toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID.toLowerCase())
    .map((row) => row.id)
  if (gaRoleIds.length === 0) return 0
  const supabase = db()
  const assignments = await fetchAllById<{ principal_identity_id: string | null }>('ga assignments overlay', () =>
    supabase
      .from('role_assignments')
      .select('id,principal_identity_id')
      .eq('tenant_id', tenantId)
      .is('removed_at', null)
      .in('directory_role_id', gaRoleIds) as unknown as RangeQuery<{ principal_identity_id: string | null }>,
  )
  return new Set(assignments.map((row) => row.principal_identity_id).filter(Boolean)).size
}

/**
 * Privileged identity ids that appear in the given set. Loads the small
 * privileged-external set for the tenant, then matches in memory so a few
 * hundred guest ids never go into one PostgREST `.in()` URL.
 */
export async function privilegedIdentityIdsAmong(tenantId: string, identityIds: string[]): Promise<string[]> {
  const unique = [...new Set(identityIds.filter(Boolean))]
  if (unique.length === 0) return []
  const supabase = db()
  const rows = await fetchAllById<{ id: string }>('privileged external ids', () =>
    supabase
      .from('identities')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_privileged', true)
      .eq('identity_class', 'external')
      .is('removed_at', null) as unknown as RangeQuery<{ id: string }>,
  )
  return privilegedIdsInSet(
    rows.map((row) => row.id),
    unique,
  )
}

/**
 * Overlay contexts keyed by identity id. Empty when the privileged flag is off
 * so rescore stays guest-only and previous overlay scores are left in place.
 * Pass identityIds to load only those identities (guest list/detail), not the
 * whole tenant. Combined scores are computed in memory; no new SQL column.
 */
export async function loadPrivilegedOverlayContexts(
  tenantId: string,
  settings: Record<string, unknown> | null | undefined,
  identityIds?: string[],
): Promise<Map<string, PrivilegedRiskContext>> {
  if (!privilegedStageEnabled(settings)) return new Map()
  if (identityIds && identityIds.length === 0) return new Map()

  const supabase = db()
  const parsed = parsePrivilegedSettings(settings)
  const hasP1 = parsed.capability?.sign_in_activity === true
  const hasP2 = parsed.capability?.pim === 'available' || parsed.capability?.license_hint === 'p2'

  const [identities, assignments, roles, accounts, resources] = await Promise.all([
    fetchAllById<IdentityRow>('identities overlay', () =>
      scopedQuery(
        supabase
          .from('identities')
          .select(
            'id,identity_class,status,last_reviewed_at,last_activity_at,owner_kind,owner_identity_id,is_privileged,privilege_tier,first_seen_at',
          )
          .eq('tenant_id', tenantId)
          .is('removed_at', null),
        'id',
        identityIds,
      ),
    ),
    fetchAllById<AssignmentRow>('role_assignments overlay', () =>
      scopedQuery(
        supabase
          .from('role_assignments')
          .select(
            'id,principal_identity_id,principal_ms_object_id,directory_role_id,assignment_type,member_type,directory_scope_id,first_seen_at',
          )
          .eq('tenant_id', tenantId)
          .is('removed_at', null),
        'principal_identity_id',
        identityIds,
      ),
    ),
    fetchAllById<RoleRow>('directory_roles overlay', () =>
      supabase.from('directory_roles').select('id,template_id,display_name,privilege_tier,is_privileged').eq('tenant_id', tenantId).is('removed_at', null),
    ),
    fetchAllById<AccountRow>('identity_accounts overlay', () =>
      scopedQuery(
        supabase
          .from('identity_accounts')
          .select('id,identity_id,source_object_id,account_kind,enabled,last_activity_at,attrs')
          .eq('tenant_id', tenantId)
          .eq('source', 'entra')
          .is('removed_at', null),
        'identity_id',
        identityIds,
      ),
    ),
    identityIds
      ? Promise.resolve([] as ResourceRow[])
      : fetchAllById<ResourceRow>('resources overlay owners', () =>
          supabase.from('resources').select('ms_object_id,owners').eq('tenant_id', tenantId).is('removed_at', null),
        ),
  ])

  const roleById = new Map(roles.map((row) => [row.id, row]))
  const accountByIdentity = new Map(accounts.map((row) => [row.identity_id, row]))
  const ownersByMs = new Map(
    resources.map((row) => [row.ms_object_id, Array.isArray(row.owners) && row.owners.length > 0] as const),
  )

  const gaCount = identityIds
    ? await countTenantGlobalAdmins(tenantId, roles)
    : new Set(
        assignments
          .filter((row) => {
            const role = roleById.get(row.directory_role_id)
            return (role?.template_id ?? '').toLowerCase() === GLOBAL_ADMIN_TEMPLATE_ID.toLowerCase() && Boolean(row.principal_identity_id)
          })
          .map((row) => row.principal_identity_id as string),
      ).size

  const byIdentity = new Map<string, PrivilegedRiskContext>()
  for (const identity of identities) {
    const account = accountByIdentity.get(identity.id)
    const rows = assignments.filter((row) => row.principal_identity_id === identity.id)
    const attrs = (account?.attrs ?? {}) as Record<string, unknown>
    const fetched = Array.isArray(attrs.auth_methods)
    const activatedRoleKeys = parseStoredActivations(attrs.pim_activations).map((row) => row.roleName)
    byIdentity.set(identity.id, {
      isPrivileged: identity.is_privileged === true,
      identityClass: identity.identity_class,
      accountKind: account?.account_kind ?? null,
      accountEnabled: account?.enabled ?? identity.status !== 'disabled',
      lastActivityAt: identity.last_activity_at ?? account?.last_activity_at ?? null,
      lastReviewedAt: identity.last_reviewed_at,
      ownerKind: identity.owner_kind,
      ownerIdentityId: identity.owner_identity_id,
      dedicatedAdmin: attrs.dedicatedAdmin === true,
      authMethods: fetched ? (attrs.auth_methods as string[]) : null,
      authMethodsKnown: fetched,
      hasP1,
      hasP2,
      globalAdminCount: gaCount,
      activatedRoleKeys,
      assignments: rows.map((row) => {
        const role = roleById.get(row.directory_role_id)
        return {
          id: row.id,
          assignmentType: row.assignment_type,
          memberType: row.member_type,
          privilegeTier: role?.privilege_tier ?? null,
          directoryScopeId: row.directory_scope_id,
          roleTemplateId: role?.template_id ?? null,
          roleName: role?.display_name ?? null,
          groupOwned: row.member_type === 'group' ? ownersByMs.get(row.principal_ms_object_id) === true : null,
        }
      }),
    })
  }
  return byIdentity
}

export function overlayForIdentity(
  overlayByIdentity: Map<string, PrivilegedRiskContext> | null,
  identityId: string | null | undefined,
): PrivilegedRiskContext | null {
  if (!overlayByIdentity || !identityId) return null
  const ctx = overlayByIdentity.get(identityId)
  if (!ctx?.isPrivileged) return null
  return ctx
}
