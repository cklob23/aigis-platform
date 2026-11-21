import 'server-only'
import { db } from '@/lib/supabase/admin'
import { fetchAllById } from '@/lib/supabase/page'
import { parsePrivilegedSettings } from '@/lib/privileged/capability'
import { requirePrivilegedDetail, type RoleKey } from '@/lib/auth/rbac'
import {
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

type IdentityQueryRow = PrivilegedIdentityRow
type AssignmentQueryRow = PrivilegedAssignmentRow & { removed_at?: string | null }
type RoleQueryRow = PrivilegedRoleRow
type FindingQueryRow = { finding_type: string; title: string; identity_id: string | null }

async function loadPrivilegedRows(tenantId: string, settings: Record<string, unknown> | null | undefined) {
  const supabase = db()
  const pimAvailable = parsePrivilegedSettings(settings).capability?.pim === 'available'
  const [identities, assignments, roles, findings] = await Promise.all([
    fetchAllById<IdentityQueryRow>('identities privileged', () =>
      supabase
        .from('identities')
        .select(
          'id,display_name,primary_email,identity_class,is_privileged,privilege_tier,last_reviewed_at,last_activity_at,risk_score,risk_level,status',
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
        .select('id,display_name,privilege_tier,is_privileged,is_built_in,description')
        .eq('tenant_id', tenantId)
        .is('removed_at', null),
    ),
    fetchAllById<FindingQueryRow>('risk_findings privileged', () =>
      supabase.from('risk_findings').select('finding_type,title,identity_id').eq('tenant_id', tenantId).eq('status', 'open'),
    ),
  ])

  const privilegedIds = new Set(identities.map((row) => row.id))
  const findingCounts = new Map<string, PrivilegedFindingCount>()
  for (const row of findings) {
    if (row.identity_id && !privilegedIds.has(row.identity_id)) continue
    const current = findingCounts.get(row.finding_type) ?? { finding_type: row.finding_type, title: row.title, count: 0 }
    current.count += 1
    findingCounts.set(row.finding_type, current)
  }

  return {
    identities,
    assignments,
    roles,
    findings: Array.from(findingCounts.values()).sort((a, b) => b.count - a.count),
    pimAvailable,
  }
}

export async function getPrivilegedSummary(
  tenantId: string,
  settings: Record<string, unknown> | null | undefined,
): Promise<PrivilegedSummary> {
  const loaded = await loadPrivilegedRows(tenantId, settings)
  return summarizePrivileged(loaded.identities, loaded.assignments, loaded.pimAvailable, loaded.findings)
}

export async function getPrivilegedDetail(
  tenantId: string,
  role: RoleKey,
  settings: Record<string, unknown> | null | undefined,
): Promise<PrivilegedDetail> {
  requirePrivilegedDetail(role)
  const loaded = await loadPrivilegedRows(tenantId, settings)
  const summary = summarizePrivileged(loaded.identities, loaded.assignments, loaded.pimAvailable, loaded.findings)
  return {
    summary,
    holders: buildPrivilegedHolders(loaded.identities, loaded.assignments, loaded.roles, loaded.pimAvailable),
    roles: buildPrivilegedRoles(loaded.roles, loaded.assignments, loaded.pimAvailable),
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
