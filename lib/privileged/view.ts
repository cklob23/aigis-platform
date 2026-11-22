import type { IdentityClass, RiskLevel } from '@/lib/types'
import { DORMANT_ADMIN_DAYS, PRIVILEGED_REVIEW_DAYS, daysSince, privilegedReviewPastCadence } from '@/lib/risk/privileged'
import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'
import { tier0RoleDescription } from '@/lib/privileged/copy'

export type PrivilegedAssignmentState = 'permanent' | 'eligible' | 'time_bound' | 'activated' | 'active'

export const ASSIGNMENT_STATE_LABEL: Record<PrivilegedAssignmentState, string> = {
  permanent: 'Permanent',
  eligible: 'Eligible',
  time_bound: 'Time-bound',
  activated: 'Activated',
  active: 'Active',
}

export const IDENTITY_CLASS_LABEL: Record<IdentityClass, string> = {
  human_internal: 'Internal user',
  external: 'External user',
  privileged: 'Privileged',
  non_human: 'Service principal',
  group: 'Group',
  agent: 'Agent',
}

export const TIER_LABEL: Record<0 | 1 | 2, string> = {
  0: 'Tier 0',
  1: 'Tier 1',
  2: 'Tier 2',
}

export const TIER_HINT: Record<0 | 1 | 2, string> = {
  0: 'tenant-wide control',
  1: 'other admin roles',
  2: 'read-only admin roles',
}

export const FINDING_EXPLANATIONS: Record<string, string> = {
  too_many_global_admins: 'Microsoft guidance is fewer than five.',
  no_strong_auth: 'No authenticator app, FIDO2 key, or Windows Hello registered.',
  sp_with_role: 'Flagged here. Full app review comes with non-human identities.',
  role_via_unowned_group: 'A role-assignable group that grants an admin role has no owner.',
  guest_with_role: 'An external identity holds a privileged directory role (any tier).',
  permanent_tier0: 'Permanent Tier 0 assignment while PIM is available.',
  permanent_tier1: 'Standing (permanent) Tier 1 assignment while PIM is available.',
  privileged_review_overdue: 'Privileged access not reviewed in the last 90 days.',
  dormant_admin: 'A privileged account has not signed in for 90 days or more.',
}

const HIDDEN_WITHOUT_P2 = new Set(['permanent_tier0', 'permanent_tier1'])

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
  owner_display_name?: string | null
  dedicated_admin?: boolean
  auth_methods?: string[] | null
  app_id?: string | null
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
  template_id?: string | null
}

export type PrivilegedFindingCount = {
  finding_type: string
  title: string
  count: number
  explanation?: string
}

export type TierAssignmentCounts = {
  holders: number
  permanent: number
  eligible: number
  timeBound: number
}

export type PrivilegedReviewsSummary = {
  cadenceDays: number
  lastCompletedAt: string | null
  nextDueAt: string | null
  openRequests: number
  awaitingApproval: number
}

export type PrivilegedWhoHolds = {
  internalUser: number
  dedicatedAdmin: number
  guests: number
  servicePrincipals: number
  viaGroups: number
}

export type PrivilegedSummary = {
  holders: number
  assignments: number
  byClass: Record<IdentityClass, number>
  byTier: { t0: number; t1: number; t2: number }
  byTierAssignments: { t0: TierAssignmentCounts; t1: TierAssignmentCounts; t2: TierAssignmentCounts }
  whoHolds: PrivilegedWhoHolds
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
  reviews: PrivilegedReviewsSummary
  remediationCount: number
}

export type PrivilegedHolder = {
  identityId: string
  displayName: string | null
  email: string | null
  identityClass: IdentityClass
  dedicatedAdmin: boolean
  privilegeTier: 0 | 1 | 2 | null
  assignmentStates: PrivilegedAssignmentState[]
  roleId: string
  roleName: string
  lastActivityAt: string | null
  lastReviewedAt: string | null
  riskScore: number
  riskLevel: RiskLevel
  status: string
  ownerDisplayName: string | null
  mfaLabel: string
  identifier: string
  topFactor: string | null
}

export type PrivilegedHighestRisk = {
  identityId: string
  displayName: string | null
  email: string | null
  identityClass: IdentityClass
  dedicatedAdmin: boolean
  privilegeTier: 0 | 1 | 2 | null
  roleNames: string[]
  lastActivityAt: string | null
  lastReviewedAt: string | null
  riskScore: number
  riskLevel: RiskLevel
  identifier: string
  topFactor: string | null
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
  lastReviewAt: string | null
}

export type PrivilegedDetail = {
  summary: PrivilegedSummary
  holders: PrivilegedHolder[]
  highestRisk: PrivilegedHighestRisk[]
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

export function combinedStateLabel(states: PrivilegedAssignmentState[], pimAvailable: boolean): string {
  if (!pimAvailable) return 'Active'
  const order: PrivilegedAssignmentState[] = ['permanent', 'eligible', 'time_bound', 'activated', 'active']
  const unique = [...new Set(states)].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  if (unique.length === 0) return '—'
  return unique.map((state) => ASSIGNMENT_STATE_LABEL[state]).join(' + ')
}

export function privilegedClassLabel(identityClass: IdentityClass, dedicatedAdmin = false): string {
  if (identityClass === 'human_internal' && dedicatedAdmin) return 'Dedicated admin'
  return IDENTITY_CLASS_LABEL[identityClass]
}

const AUTH_METHOD_LABELS: Record<string, string> = {
  microsoftAuthenticatorAuthenticationMethod: 'Microsoft Authenticator',
  passwordAuthenticationMethod: 'Password',
  phoneAuthenticationMethod: 'Phone',
  fido2AuthenticationMethod: 'FIDO2',
  windowsHelloForBusinessAuthenticationMethod: 'Windows Hello',
  softwareOathAuthenticationMethod: 'Authenticator app (OATH)',
  hardwareOathAuthenticationMethod: 'Hardware OATH',
  emailAuthenticationMethod: 'Email',
  certificateBasedAuthenticationMethod: 'Certificate',
}

export function mfaMethodLabel(identityClass: IdentityClass, methods: string[] | null | undefined): string {
  if (identityClass === 'non_human' || identityClass === 'group' || identityClass === 'agent') return 'n/a'
  if (methods == null) return '—'
  if (methods.length === 0) return 'None'
  return methods
    .map((method) => AUTH_METHOD_LABELS[method] ?? method.replace(/AuthenticationMethod$/, ''))
    .join(', ')
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

export function emptyTierAssignments(): TierAssignmentCounts {
  return { holders: 0, permanent: 0, eligible: 0, timeBound: 0 }
}

export function emptyReviews(): PrivilegedReviewsSummary {
  return {
    cadenceDays: PRIVILEGED_REVIEW_DAYS,
    lastCompletedAt: null,
    nextDueAt: null,
    openRequests: 0,
    awaitingApproval: 0,
  }
}

export function visiblePrivilegedFindings(
  findings: PrivilegedFindingCount[],
  pimAvailable: boolean,
): PrivilegedFindingCount[] {
  return findings
    .filter((row) => pimAvailable || !HIDDEN_WITHOUT_P2.has(row.finding_type))
    .map((row) => ({
      ...row,
      title: displayFindingTitle(row.finding_type, row.title),
      explanation: row.explanation ?? FINDING_EXPLANATIONS[row.finding_type] ?? row.title,
    }))
}

export function displayFindingTitle(findingType: string, fallback: string) {
  if (findingType === 'guest_with_role') return 'External identity with an admin role'
  if (findingType === 'permanent_tier0') return 'Permanent Tier 0 assignment'
  return fallback
}

export function truncatedAppId(appId: string) {
  const id = appId.trim()
  if (id.length <= 8) return id
  return `${id.slice(0, 4)}…${id.slice(-4)}`
}

export function holderIdentifier(identity: Pick<PrivilegedIdentityRow, 'identity_class' | 'primary_email' | 'app_id'>) {
  if (identity.identity_class === 'non_human') {
    if (!identity.app_id) return '—'
    return `app id ${truncatedAppId(identity.app_id)}`
  }
  return identity.primary_email ?? '—'
}

export function nextPrivilegedReviewDueAt(lastCompletedAt: string | null, cadenceDays = PRIVILEGED_REVIEW_DAYS) {
  if (!lastCompletedAt) return null
  const d = new Date(lastCompletedAt)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + cadenceDays)
  return d.toISOString()
}

/** Same floor-day rule as privilegedReviewPastCadence: due only after the due instant is more than 0 full days ago. */
export function privilegedReviewDueOverdue(nextDueAt: string | null, now = Date.now()) {
  const age = daysSince(nextDueAt, now)
  return age !== null && age > 0
}

export function summarizePrivileged(
  identities: PrivilegedIdentityRow[],
  assignments: PrivilegedAssignmentRow[],
  roles: PrivilegedRoleRow[] = [],
  pimAvailable = true,
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
  let dedicatedAdmin = 0

  for (const row of privileged) {
    byClass[row.identity_class] += 1
    if (row.dedicated_admin && row.identity_class === 'human_internal') dedicatedAdmin += 1
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
  const viaGroupIds = new Set<string>()
  for (const row of liveAssignments) {
    const state = assignmentState(row, pimAvailable)
    if (state === 'permanent' || state === 'active') standing += 1
    else if (state === 'eligible') jitEligible += 1
    else if (state === 'time_bound') timeBound += 1
    else if (state === 'activated') activated += 1
    if (row.member_type === 'group' && row.principal_identity_id) viaGroupIds.add(row.principal_identity_id)
  }

  const roleById = new Map(roles.map((row) => [row.id, row]))
  const byTierAssignments = {
    t0: emptyTierAssignments(),
    t1: emptyTierAssignments(),
    t2: emptyTierAssignments(),
  }
  const holdersByTierSeen = {
    t0: new Set<string>(),
    t1: new Set<string>(),
    t2: new Set<string>(),
  }
  for (const identity of privileged) {
    const key = identity.privilege_tier === 0 ? 't0' : identity.privilege_tier === 1 ? 't1' : identity.privilege_tier === 2 ? 't2' : null
    if (key) holdersByTierSeen[key].add(identity.id)
  }
  byTierAssignments.t0.holders = holdersByTierSeen.t0.size
  byTierAssignments.t1.holders = holdersByTierSeen.t1.size
  byTierAssignments.t2.holders = holdersByTierSeen.t2.size

  for (const row of liveAssignments) {
    const role = roleById.get(row.directory_role_id)
    const tier = role?.privilege_tier
    const bucket = tier === 0 ? byTierAssignments.t0 : tier === 1 ? byTierAssignments.t1 : tier === 2 ? byTierAssignments.t2 : null
    if (!bucket) continue
    const state = assignmentState(row, pimAvailable)
    if (state === 'permanent' || state === 'active') bucket.permanent += 1
    else if (state === 'eligible') bucket.eligible += 1
    else if (state === 'time_bound') bucket.timeBound += 1
  }

  return {
    holders: privileged.length,
    assignments: liveAssignments.length,
    byClass,
    byTier,
    byTierAssignments,
    whoHolds: {
      internalUser: Math.max(0, byClass.human_internal - dedicatedAdmin),
      dedicatedAdmin,
      guests: byClass.external,
      servicePrincipals: byClass.non_human,
      viaGroups: viaGroupIds.size,
    },
    standing,
    jitEligible,
    timeBound,
    activated,
    pimAvailable,
    lastPrivilegedReviewAt,
    neverReviewed,
    overdueReviews,
    dormant,
    findings: visiblePrivilegedFindings(findings, pimAvailable),
    reviews: emptyReviews(),
    remediationCount: 0,
  }
}

export function buildPrivilegedHolders(
  identities: PrivilegedIdentityRow[],
  assignments: PrivilegedAssignmentRow[],
  roles: PrivilegedRoleRow[],
  pimAvailable: boolean,
  topFactorByIdentity: Record<string, string> = {},
): PrivilegedHolder[] {
  const roleById = new Map(roles.map((row) => [row.id, row]))
  const identityById = new Map(identities.filter((row) => row.is_privileged).map((row) => [row.id, row]))

  type Group = {
    identity: PrivilegedIdentityRow
    roleId: string
    roleName: string
    states: PrivilegedAssignmentState[]
  }
  const groups = new Map<string, Group>()

  for (const row of assignments) {
    if (!row.principal_identity_id) continue
    const identity = identityById.get(row.principal_identity_id)
    if (!identity) continue
    const role = roleById.get(row.directory_role_id)
    if (role && !role.is_privileged) continue
    const key = `${identity.id}::${row.directory_role_id}`
    const current = groups.get(key) ?? {
      identity,
      roleId: row.directory_role_id,
      roleName: role?.display_name ?? 'Directory role',
      states: [],
    }
    const state = assignmentState(row, pimAvailable)
    if (!current.states.includes(state)) current.states.push(state)
    groups.set(key, current)
  }

  const rows: PrivilegedHolder[] = []
  for (const group of groups.values()) {
    const identity = group.identity
    rows.push({
      identityId: identity.id,
      displayName: identity.display_name,
      email: identity.primary_email,
      identityClass: identity.identity_class,
      dedicatedAdmin: Boolean(identity.dedicated_admin),
      privilegeTier: identity.privilege_tier,
      assignmentStates: group.states,
      roleId: group.roleId,
      roleName: group.roleName,
      lastActivityAt: identity.last_activity_at,
      lastReviewedAt: identity.last_reviewed_at,
      riskScore: identity.risk_score,
      riskLevel: identity.risk_level,
      status: identity.status,
      ownerDisplayName: identity.owner_display_name ?? null,
      mfaLabel: mfaMethodLabel(identity.identity_class, identity.auth_methods),
      identifier: holderIdentifier(identity),
      topFactor: topFactorByIdentity[identity.id] ?? null,
    })
  }

  return rows.sort((a, b) => {
    const tierA = a.privilegeTier ?? 9
    const tierB = b.privilegeTier ?? 9
    if (tierA !== tierB) return tierA - tierB
    const name = (a.displayName ?? a.email ?? '').localeCompare(b.displayName ?? b.email ?? '')
    if (name !== 0) return name
    return a.roleName.localeCompare(b.roleName)
  })
}

export function buildHighestRiskHolders(holders: PrivilegedHolder[], limit = 4): PrivilegedHighestRisk[] {
  const byIdentity = new Map<string, PrivilegedHighestRisk>()
  for (const row of holders) {
    const current = byIdentity.get(row.identityId)
    if (!current) {
      byIdentity.set(row.identityId, {
        identityId: row.identityId,
        displayName: row.displayName,
        email: row.email,
        identityClass: row.identityClass,
        dedicatedAdmin: row.dedicatedAdmin,
        privilegeTier: row.privilegeTier,
        roleNames: [row.roleName],
        lastActivityAt: row.lastActivityAt,
        lastReviewedAt: row.lastReviewedAt,
        riskScore: row.riskScore,
        riskLevel: row.riskLevel,
        identifier: row.identifier,
        topFactor: row.topFactor,
      })
      continue
    }
    if (!current.roleNames.includes(row.roleName)) current.roleNames.push(row.roleName)
  }
  return Array.from(byIdentity.values())
    .sort((a, b) => b.riskScore - a.riskScore || (a.displayName ?? '').localeCompare(b.displayName ?? ''))
    .slice(0, limit)
}

export function buildPrivilegedRoles(
  roles: PrivilegedRoleRow[],
  assignments: PrivilegedAssignmentRow[],
  identities: PrivilegedIdentityRow[] = [],
  pimAvailable = true,
): PrivilegedRoleListItem[] {
  const identityById = new Map(identities.map((row) => [row.id, row]))
  const listed = roles.filter((row) => row.is_privileged)
  const present = new Set(listed.map((row) => row.display_name))
  for (const name of TIER_0_DIRECTORY_ROLES) {
    if (present.has(name)) continue
    listed.push({
      id: `missing-t0:${name}`,
      display_name: name,
      privilege_tier: 0,
      is_privileged: true,
      is_built_in: true,
      description: tier0RoleDescription(name),
    })
  }

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

  return listed
    .map((row) => {
      const holderIds = holdersByRole.get(row.id) ?? new Set()
      let lastReviewAt: string | null = null
      for (const id of holderIds) {
        const reviewed = identityById.get(id)?.last_reviewed_at ?? null
        if (reviewed && (!lastReviewAt || reviewed > lastReviewAt)) lastReviewAt = reviewed
      }
      return {
        id: row.id,
        displayName: row.display_name,
        privilegeTier: row.privilege_tier,
        isPrivileged: row.is_privileged,
        isBuiltIn: row.is_built_in,
        description: row.description ?? (row.privilege_tier === 0 ? tier0RoleDescription(row.display_name) : null),
        holderCount: holderIds.size,
        standingCount: standingByRole.get(row.id) ?? 0,
        eligibleCount: eligibleByRole.get(row.id) ?? 0,
        lastReviewAt,
      }
    })
    .sort((a, b) => {
      const tierA = a.privilegeTier ?? 9
      const tierB = b.privilegeTier ?? 9
      if (tierA !== tierB) return tierA - tierB
      if (a.holderCount === 0 && b.holderCount !== 0) return 1
      if (a.holderCount !== 0 && b.holderCount === 0) return -1
      return a.displayName.localeCompare(b.displayName)
    })
}

export type HolderFilters = {
  q?: string
  class?: IdentityClass | 'all'
  tier?: '0' | '1' | '2' | 'all'
  state?: PrivilegedAssignmentState | 'all'
  owner?: 'any' | 'unowned' | 'all'
  dormant?: boolean
  review?: 'overdue' | 'never' | 'all'
}

export function filterHolders(holders: PrivilegedHolder[], filters: HolderFilters, now = Date.now()): PrivilegedHolder[] {
  const q = filters.q?.trim().toLowerCase()
  return holders.filter((row) => {
    if (q) {
      const hay = `${row.displayName ?? ''} ${row.email ?? ''} ${row.roleName}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (filters.class && filters.class !== 'all') {
      if (filters.class === 'human_internal' && row.dedicatedAdmin) return false
      if (row.identityClass !== filters.class) return false
    }
    if (filters.tier && filters.tier !== 'all' && String(row.privilegeTier) !== filters.tier) return false
    if (filters.state && filters.state !== 'all' && !row.assignmentStates.includes(filters.state)) return false
    if (filters.owner === 'unowned' && row.ownerDisplayName) return false
    if (filters.dormant) {
      const idle = daysSince(row.lastActivityAt, now)
      if (row.lastActivityAt != null && (idle === null || idle < DORMANT_ADMIN_DAYS)) return false
    }
    if (filters.review === 'never' && row.lastReviewedAt) return false
    if (filters.review === 'overdue' && !privilegedReviewPastCadence(row.lastReviewedAt, now)) return false
    return true
  })
}

export function uniqueHolderCount(holders: PrivilegedHolder[]) {
  return new Set(holders.map((row) => row.identityId)).size
}

export type PrivilegedHolderGroup = PrivilegedHolder & { roleNames: string[] }

/** One row per identity. Extra privileged roles collapse to +N in the Roles column. */
export function groupHoldersByIdentity(holders: PrivilegedHolder[]): PrivilegedHolderGroup[] {
  const map = new Map<string, PrivilegedHolderGroup>()
  for (const row of holders) {
    const current = map.get(row.identityId)
    if (!current) {
      map.set(row.identityId, { ...row, assignmentStates: [...row.assignmentStates], roleNames: [row.roleName] })
      continue
    }
    if (!current.roleNames.includes(row.roleName)) current.roleNames.push(row.roleName)
    for (const state of row.assignmentStates) {
      if (!current.assignmentStates.includes(state)) current.assignmentStates.push(state)
    }
  }
  return [...map.values()]
}

export function summaryHasIdentityNames(summary: PrivilegedSummary, identities: PrivilegedIdentityRow[]) {
  const blob = JSON.stringify(summary)
  return identities.some((row) => {
    if (row.display_name && blob.includes(row.display_name)) return true
    if (row.primary_email && blob.includes(row.primary_email)) return true
    return false
  })
}
