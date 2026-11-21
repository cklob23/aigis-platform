import type { PrivilegeTier } from '@/lib/privileged/tiers'
import { computePrivilegeOverlay, type PrivilegeOverlayInput } from '@/lib/risk/overlay'
import { identityRiskPatch, type RiskPolicyConfig } from '@/lib/risk/engine'
import type { IdentityRiskUpdate, RiskScoreInsert } from '@/lib/scan/persist'

export type OverlayIdentityRow = {
  id: string
  is_privileged: boolean
  privilege_tier: PrivilegeTier | null
  status: string
  last_activity_at: string | null
  first_seen_at: string | null
  risk_score: number
  risk_level: string
  recommended_action: string
}

export type OverlayAccountRow = {
  identity_id: string
  enabled: boolean
  last_activity_at: string | null
}

export type OverlayAssignmentRow = {
  principal_identity_id: string | null
  directory_role_id: string
  assignment_type: 'active' | 'eligible' | string
}

export type OverlayRoleRow = {
  id: string
  is_privileged: boolean
}

export type OverlayGroupPimRow = {
  principal_identity_id: string | null
  access_id: 'member' | 'owner' | string
}

export type PrivilegedRiskPlan = {
  identityUpdates: IdentityRiskUpdate[]
  scoreRows: RiskScoreInsert[]
}

function stubPatch() {
  return identityRiskPatch({ score: 0, level: 'low', factors: [], recommendedAction: 'keep' })
}

function needsClear(row: OverlayIdentityRow) {
  return row.risk_score !== 0 || row.risk_level !== 'low' || row.recommended_action !== 'keep'
}

/**
 * Score human_internal identities from inventoried privilege holdings.
 * Callers must page every select with fetchAllById. No Graph.
 */
export function planPrivilegedRiskOverlay(input: {
  tenantId: string
  scanJobId: string | null
  identities: OverlayIdentityRow[]
  accounts: OverlayAccountRow[]
  assignments: OverlayAssignmentRow[]
  roles: OverlayRoleRow[]
  groupEligibilities: OverlayGroupPimRow[]
  policy: RiskPolicyConfig
  activityKnown: boolean
  overlayOn: boolean
  now?: number
}): PrivilegedRiskPlan {
  if (!input.overlayOn) {
    const identityUpdates = input.identities.filter(needsClear).map((row) => ({
      id: row.id,
      ...stubPatch(),
    }))
    return { identityUpdates, scoreRows: [] }
  }

  const privilegedRoleIds = new Set(input.roles.filter((role) => role.is_privileged).map((role) => role.id))
  const standing = new Set<string>()
  const eligible = new Set<string>()
  for (const row of input.assignments) {
    if (!row.principal_identity_id || !privilegedRoleIds.has(row.directory_role_id)) continue
    if (row.assignment_type === 'active') standing.add(row.principal_identity_id)
    else if (row.assignment_type === 'eligible') eligible.add(row.principal_identity_id)
  }
  const groupOwners = new Set<string>()
  for (const row of input.groupEligibilities) {
    if (row.access_id === 'owner' && row.principal_identity_id) groupOwners.add(row.principal_identity_id)
  }

  const accountByIdentity = new Map<string, OverlayAccountRow>()
  for (const account of input.accounts) {
    if (!accountByIdentity.has(account.identity_id)) accountByIdentity.set(account.identity_id, account)
  }

  const identityUpdates: PrivilegedRiskPlan['identityUpdates'] = []
  const scoreRows: RiskScoreInsert[] = []
  const now = input.now ?? Date.now()

  for (const identity of input.identities) {
    const account = accountByIdentity.get(identity.id)
    const overlayInput: PrivilegeOverlayInput = {
      isPrivileged: identity.is_privileged,
      privilegeTier: identity.privilege_tier,
      standingPrivileged: standing.has(identity.id),
      eligiblePrivileged: eligible.has(identity.id),
      groupPimOwner: groupOwners.has(identity.id),
      accountEnabled: account ? account.enabled : identity.status !== 'disabled',
      lastActivityAt: identity.last_activity_at ?? account?.last_activity_at ?? null,
      firstSeenAt: identity.first_seen_at,
      activityKnown: input.activityKnown,
    }
    const risk = computePrivilegeOverlay(overlayInput, input.policy, now)
    identityUpdates.push({ id: identity.id, ...identityRiskPatch(risk) })
    scoreRows.push({
      tenant_id: input.tenantId,
      guest_id: null,
      identity_id: identity.id,
      scan_job_id: input.scanJobId,
      score: risk.score,
      level: risk.level,
      factors: risk.factors,
    })
  }

  return { identityUpdates, scoreRows }
}
