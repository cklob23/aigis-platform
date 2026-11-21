import 'server-only'
import { db } from '@/lib/supabase/admin'
import { fetchAllById } from '@/lib/supabase/page'
import { parsePrivilegedSettings } from '@/lib/privileged/capability'
import { requirePrivilegedDetail, type RoleKey } from '@/lib/auth/rbac'
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

type IdentityQueryRow = PrivilegedIdentityRow & { owner_display_name?: string | null }
type AssignmentQueryRow = PrivilegedAssignmentRow & { removed_at?: string | null }
type RoleQueryRow = PrivilegedRoleRow
type FindingQueryRow = { finding_type: string; title: string; identity_id: string | null }
type AccountQueryRow = {
  identity_id: string
  account_kind: string | null
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
          'id,display_name,primary_email,identity_class,is_privileged,privilege_tier,last_reviewed_at,last_activity_at,risk_score,risk_level,status,owner_display_name',
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
        .select('identity_id,account_kind,attrs')
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
    return {
      ...row,
      owner_display_name: row.owner_display_name ?? null,
      dedicated_admin: Boolean(attrs?.dedicated_admin),
      auth_methods: authMethodsFromAttrs(attrs),
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
