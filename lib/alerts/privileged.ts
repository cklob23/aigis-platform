import type { AssignmentRecommendedChange, IdentityClass } from '@/lib/types'
import { DORMANT_ADMIN_DAYS, PRIVILEGED_REVIEW_DAYS, recommendAssignmentChange } from '@/lib/risk/privileged'

const DAY = 86_400_000

export type PrivilegedAlertIdentity = {
  id: string
  identity_class: IdentityClass
  display_name: string | null
  primary_email: string | null
  is_privileged: boolean
  last_activity_at: string | null
  last_reviewed_at: string | null
  first_seen_at: string
  status: string
}

export type PrivilegedAlertAssignment = {
  id: string
  principal_identity_id: string | null
  assignment_type: 'active' | 'eligible'
  member_type: 'direct' | 'group' | 'inherited'
  privilege_tier: 0 | 1 | 2 | null
  directory_scope_id: string | null
  first_seen_at: string
}

export type PrivilegedAlertCandidate = {
  identityId: string
  guestId?: string | null
  title: string
  description: string
  metadata?: Record<string, unknown>
}

function label(row: PrivilegedAlertIdentity) {
  return row.display_name ?? row.primary_email ?? 'Privileged identity'
}

export function newTier0AssignmentCandidates(
  identities: PrivilegedAlertIdentity[],
  assignments: PrivilegedAlertAssignment[],
  sinceMs: number,
): PrivilegedAlertCandidate[] {
  const byId = new Map(identities.map((row) => [row.id, row]))
  const out: PrivilegedAlertCandidate[] = []
  for (const row of assignments) {
    if (row.privilege_tier !== 0 || !row.principal_identity_id) continue
    if (new Date(row.first_seen_at).getTime() < sinceMs) continue
    const identity = byId.get(row.principal_identity_id)
    if (!identity) continue
    out.push({
      identityId: identity.id,
      title: `New Tier 0 assignment: ${label(identity)}`,
      description: 'A Tier 0 directory role was assigned since the last scan.',
      metadata: { assignment_id: row.id },
    })
  }
  return out
}

export function guestWithRoleCandidates(identities: PrivilegedAlertIdentity[]): PrivilegedAlertCandidate[] {
  return identities
    .filter((row) => row.is_privileged && row.identity_class === 'external')
    .map((row) => ({
      identityId: row.id,
      title: `Guest with a directory role: ${label(row)}`,
      description: 'An external identity holds a privileged directory role.',
    }))
}

export function dormantAdminCandidates(identities: PrivilegedAlertIdentity[], now: number): PrivilegedAlertCandidate[] {
  const cutoff = now - DORMANT_ADMIN_DAYS * DAY
  return identities
    .filter((row) => {
      if (!row.is_privileged) return false
      if (!row.last_activity_at) return true
      return new Date(row.last_activity_at).getTime() < cutoff
    })
    .map((row) => ({
      identityId: row.id,
      title: `Dormant privileged identity: ${label(row)}`,
      description: row.last_activity_at ? 'No sign-in for 90 days or more.' : 'No sign-in activity recorded.',
    }))
}

export function privilegedNotReviewedCandidates(
  identities: PrivilegedAlertIdentity[],
  now: number,
): PrivilegedAlertCandidate[] {
  const cutoff = now - PRIVILEGED_REVIEW_DAYS * DAY
  return identities
    .filter((row) => {
      if (!row.is_privileged) return false
      if (!row.last_reviewed_at) return true
      return new Date(row.last_reviewed_at).getTime() < cutoff
    })
    .map((row) => ({
      identityId: row.id,
      title: `Privileged identity not reviewed: ${label(row)}`,
      description: row.last_reviewed_at ? 'Last privileged review is overdue.' : 'This privileged identity has never been reviewed.',
    }))
}

export function privilegedChangeNotSeenCandidates(
  identities: PrivilegedAlertIdentity[],
  assignments: PrivilegedAlertAssignment[],
  now: number,
  hasP2: boolean,
): PrivilegedAlertCandidate[] {
  if (!hasP2) return []
  const byId = new Map(identities.map((row) => [row.id, row]))
  const stale = now - 7 * DAY
  const out: PrivilegedAlertCandidate[] = []
  for (const row of assignments) {
    if (row.assignment_type !== 'active' || (row.privilege_tier !== 0 && row.privilege_tier !== 1)) continue
    if (!row.principal_identity_id) continue
    if (new Date(row.first_seen_at).getTime() > stale) continue
    const change: AssignmentRecommendedChange | null = recommendAssignmentChange(
      {
        assignmentType: row.assignment_type,
        memberType: row.member_type,
        privilegeTier: row.privilege_tier,
        directoryScopeId: row.directory_scope_id,
      },
      {
        hasP2: true,
        accountEnabled: byId.get(row.principal_identity_id)?.status !== 'disabled',
        dormant: false,
        guest: byId.get(row.principal_identity_id)?.identity_class === 'external',
        dailyUse: false,
        dedicatedAdmin: true,
        assignmentCount: 1,
      },
    )
    if (change !== 'convert_to_eligible') continue
    const identity = byId.get(row.principal_identity_id)
    if (!identity?.is_privileged) continue
    out.push({
      identityId: identity.id,
      title: `Privileged change not seen: ${label(identity)}`,
      description: 'A standing privileged assignment is still in place after AIGIS recommended converting it to eligible.',
      metadata: { assignment_id: row.id, recommended_change: change },
    })
  }
  return out
}
