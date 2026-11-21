import type { IdentityClass, RiskLevel } from '@/lib/types'
import { DORMANT_ADMIN_DAYS, daysSince, privilegedReviewPastCadence } from '@/lib/risk/privileged'

export type PrivilegedAssignmentState = 'permanent' | 'eligible' | 'time_bound' | 'activated' | 'active'

export const ASSIGNMENT_STATE_LABEL: Record<PrivilegedAssignmentState, string> = {
  permanent: 'Permanent',
  eligible: 'Eligible',
  time_bound: 'Time-bound',
  activated: 'Activated',
  active: 'Active',
}

export const IDENTITY_CLASS_LABEL: Record<IdentityClass, string> = {
  human_internal: 'Internal',
  external: 'External',
  privileged: 'Privileged',
  non_human: 'Non-human',
  group: 'Group',
  agent: 'Agent',
}

export const TIER_LABEL: Record<0 | 1 | 2, string> = {
  0: 'Tier 0',
  1: 'Tier 1',
  2: 'Tier 2',
}

export type PrivilegedIdentityRow = {
  id: string
  display_name: string | null
  primary_email: string | null
  identity_class: IdentityClass
  is_privileged: boolean
  privilege_tier: 0 | 1 | 2 | null
  last_reviewed_at: string | null
  last_activity_at: string | null
  risk_score: number
  risk_level: RiskLevel
  status: string
}

export type PrivilegedAssignmentRow = {
  id: string
  principal_identity_id: string | null
  assignment_type: 'active' | 'eligible'
  member_type: 'direct' | 'group' | 'inherited'
  pim_status: string | null
  starts_at: string | null
  ends_at: string | null
  directory_scope_id: string
  directory_role_id: string
}

export type PrivilegedRoleRow = {
  id: string
  display_name: string
  privilege_tier: 0 | 1 | 2 | null
  is_privileged: boolean
  is_built_in: boolean
  description: string | null
}

export type PrivilegedFindingCount = {
  finding_type: string
  title: string
  count: number
}

export type PrivilegedSummary = {
  holders: number
  assignments: number
  byClass: Record<IdentityClass, number>
  byTier: { t0: number; t1: number; t2: number }
  standing: number
  jitEligible: number
  timeBound: number
  activated: number
  pimAvailable: boolean
  lastPrivilegedReviewAt: string | null
  neverReviewed: number
  overdueReviews: number
  dormant: number
  findings: PrivilegedFindingCount[]
}

export type PrivilegedHolder = {
  identityId: string
  displayName: string | null
  email: string | null
  identityClass: IdentityClass
  privilegeTier: 0 | 1 | 2 | null
  assignmentStates: PrivilegedAssignmentState[]
  roles: { assignmentId: string; roleId: string; roleName: string; state: PrivilegedAssignmentState; scope: string }[]
  lastActivityAt: string | null
  lastReviewedAt: string | null
  riskScore: number
  riskLevel: RiskLevel
  status: string
}

export type PrivilegedRoleListItem = {
  id: string
  displayName: string
  privilegeTier: 0 | 1 | 2 | null
  isPrivileged: boolean
  isBuiltIn: boolean
  description: string | null
  holderCount: number
  standingCount: number
  eligibleCount: number
}

export type PrivilegedDetail = {
  summary: PrivilegedSummary
  holders: PrivilegedHolder[]
  roles: PrivilegedRoleListItem[]
}

export function assignmentState(
  row: Pick<PrivilegedAssignmentRow, 'assignment_type' | 'ends_at' | 'pim_status'>,
  pimAvailable: boolean,
): PrivilegedAssignmentState {
  if (!pimAvailable) return 'active'
  if (row.assignment_type === 'eligible') return 'eligible'
  const status = (row.pim_status ?? '').toLowerCase()
  if (status.includes('activated')) return 'activated'
  if (row.ends_at) return 'time_bound'
  return 'permanent'
}

export function emptyClassCounts(): Record<IdentityClass, number> {
  return {
    human_internal: 0,
    external: 0,
    privileged: 0,
    non_human: 0,
    group: 0,
    agent: 0,
  }
}

export function summarizePrivileged(
  identities: PrivilegedIdentityRow[],
  assignments: PrivilegedAssignmentRow[],
  pimAvailable: boolean,
  findings: PrivilegedFindingCount[] = [],
  now = Date.now(),
): PrivilegedSummary {
  const privileged = identities.filter((row) => row.is_privileged)
  const byClass = emptyClassCounts()
  const byTier = { t0: 0, t1: 0, t2: 0 }
  let lastPrivilegedReviewAt: string | null = null
  let neverReviewed = 0
  let overdueReviews = 0
  let dormant = 0

  for (const row of privileged) {
    byClass[row.identity_class] += 1
    if (row.privilege_tier === 0) byTier.t0 += 1
    else if (row.privilege_tier === 1) byTier.t1 += 1
    else if (row.privilege_tier === 2) byTier.t2 += 1
    if (!row.last_reviewed_at) neverReviewed += 1
    else if (privilegedReviewPastCadence(row.last_reviewed_at, now)) overdueReviews += 1
    if (row.last_reviewed_at && (!lastPrivilegedReviewAt || row.last_reviewed_at > lastPrivilegedReviewAt)) {
      lastPrivilegedReviewAt = row.last_reviewed_at
    }
    const idle = daysSince(row.last_activity_at, now)
    if (row.last_activity_at == null || (idle !== null && idle >= DORMANT_ADMIN_DAYS)) dormant += 1
  }

  const privilegedIds = new Set(privileged.map((row) => row.id))
  const liveAssignments = assignments.filter(
    (row) => row.principal_identity_id && privilegedIds.has(row.principal_identity_id),
  )

  let standing = 0
  let jitEligible = 0
  let timeBound = 0
  let activated = 0
  for (const row of liveAssignments) {
    const state = assignmentState(row, pimAvailable)
    if (state === 'permanent' || state === 'active') standing += 1
    else if (state === 'eligible') jitEligible += 1
    else if (state === 'time_bound') timeBound += 1
    else if (state === 'activated') activated += 1
  }

  return {
    holders: privileged.length,
    assignments: liveAssignments.length,
    byClass,
    byTier,
    standing,
    jitEligible,
    timeBound,
    activated,
    pimAvailable,
    lastPrivilegedReviewAt,
    neverReviewed,
    overdueReviews,
    dormant,
    findings,
  }
}

export function buildPrivilegedHolders(
  identities: PrivilegedIdentityRow[],
  assignments: PrivilegedAssignmentRow[],
  roles: PrivilegedRoleRow[],
  pimAvailable: boolean,
): PrivilegedHolder[] {
  const roleById = new Map(roles.map((row) => [row.id, row]))
  const byIdentity = new Map<string, PrivilegedHolder>()

  for (const identity of identities) {
    if (!identity.is_privileged) continue
    byIdentity.set(identity.id, {
      identityId: identity.id,
      displayName: identity.display_name,
      email: identity.primary_email,
      identityClass: identity.identity_class,
      privilegeTier: identity.privilege_tier,
      assignmentStates: [],
      roles: [],
      lastActivityAt: identity.last_activity_at,
      lastReviewedAt: identity.last_reviewed_at,
      riskScore: identity.risk_score,
      riskLevel: identity.risk_level,
      status: identity.status,
    })
  }

  for (const row of assignments) {
    if (!row.principal_identity_id) continue
    const holder = byIdentity.get(row.principal_identity_id)
    if (!holder) continue
    const role = roleById.get(row.directory_role_id)
    const state = assignmentState(row, pimAvailable)
    holder.roles.push({
      assignmentId: row.id,
      roleId: row.directory_role_id,
      roleName: role?.display_name ?? 'Directory role',
      state,
      scope: row.directory_scope_id || '/',
    })
    if (!holder.assignmentStates.includes(state)) holder.assignmentStates.push(state)
  }

  return Array.from(byIdentity.values()).sort((a, b) => {
    const tierA = a.privilegeTier ?? 9
    const tierB = b.privilegeTier ?? 9
    if (tierA !== tierB) return tierA - tierB
    return (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? '')
  })
}

export function buildPrivilegedRoles(
  roles: PrivilegedRoleRow[],
  assignments: PrivilegedAssignmentRow[],
  pimAvailable: boolean,
): PrivilegedRoleListItem[] {
  const holdersByRole = new Map<string, Set<string>>()
  const standingByRole = new Map<string, number>()
  const eligibleByRole = new Map<string, number>()
  for (const row of assignments) {
    if (!row.principal_identity_id) continue
    const holders = holdersByRole.get(row.directory_role_id) ?? new Set()
    holders.add(row.principal_identity_id)
    holdersByRole.set(row.directory_role_id, holders)
    const state = assignmentState(row, pimAvailable)
    if (state === 'permanent' || state === 'active') {
      standingByRole.set(row.directory_role_id, (standingByRole.get(row.directory_role_id) ?? 0) + 1)
    }
    if (state === 'eligible') {
      eligibleByRole.set(row.directory_role_id, (eligibleByRole.get(row.directory_role_id) ?? 0) + 1)
    }
  }

  return roles
    .map((row) => ({
      id: row.id,
      displayName: row.display_name,
      privilegeTier: row.privilege_tier,
      isPrivileged: row.is_privileged,
      isBuiltIn: row.is_built_in,
      description: row.description,
      holderCount: holdersByRole.get(row.id)?.size ?? 0,
      standingCount: standingByRole.get(row.id) ?? 0,
      eligibleCount: eligibleByRole.get(row.id) ?? 0,
    }))
    .sort((a, b) => {
      const tierA = a.privilegeTier ?? 9
      const tierB = b.privilegeTier ?? 9
      if (tierA !== tierB) return tierA - tierB
      return a.displayName.localeCompare(b.displayName)
    })
}

export type HolderFilters = {
  q?: string
  class?: IdentityClass | 'all'
  tier?: '0' | '1' | '2' | 'all'
  state?: PrivilegedAssignmentState | 'all'
  review?: 'overdue' | 'never' | 'all'
}

export function filterHolders(holders: PrivilegedHolder[], filters: HolderFilters, now = Date.now()): PrivilegedHolder[] {
  const q = filters.q?.trim().toLowerCase()
  return holders.filter((row) => {
    if (q) {
      const hay = `${row.displayName ?? ''} ${row.email ?? ''} ${row.roles.map((r) => r.roleName).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.class && filters.class !== 'all' && row.identityClass !== filters.class) return false
    if (filters.tier && filters.tier !== 'all' && String(row.privilegeTier) !== filters.tier) return false
    if (filters.state && filters.state !== 'all' && !row.assignmentStates.includes(filters.state)) return false
    if (filters.review === 'never' && row.lastReviewedAt) return false
    if (filters.review === 'overdue' && !privilegedReviewPastCadence(row.lastReviewedAt, now)) return false
    return true
  })
}

export function summaryHasIdentityNames(summary: PrivilegedSummary, identities: PrivilegedIdentityRow[]) {
  const blob = JSON.stringify(summary)
  return identities.some((row) => {
    if (row.display_name && blob.includes(row.display_name)) return true
    if (row.primary_email && blob.includes(row.primary_email)) return true
    return false
  })
}
