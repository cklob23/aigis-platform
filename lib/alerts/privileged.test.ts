import { describe, expect, it } from 'vitest'
import { PRIVILEGED_REVIEW_DAYS, privilegedReviewPastCadence } from '@/lib/risk/privileged'
import {
  dormantAdminCandidates,
  guestWithRoleCandidates,
  newTier0AssignmentCandidates,
  privilegedChangeNotSeenCandidates,
  privilegedNotReviewedCandidates,
  type PrivilegedAlertIdentity,
} from '@/lib/alerts/privileged'

const NOW = Date.parse('2026-11-21T00:00:00.000Z')

function identity(partial: Partial<PrivilegedAlertIdentity> = {}): PrivilegedAlertIdentity {
  return {
    id: 'id-1',
    identity_class: 'human_internal',
    display_name: 'Adele Admin',
    primary_email: 'adele@contoso.com',
    is_privileged: true,
    last_activity_at: '2026-11-20T00:00:00.000Z',
    last_reviewed_at: '2026-10-01T00:00:00.000Z',
    first_seen_at: '2026-01-01T00:00:00.000Z',
    status: 'active',
    ...partial,
  }
}

describe('privileged alert candidates', () => {
  it('fires new_tier0_assignment for first-seen T0 rows', () => {
    const found = newTier0AssignmentCandidates(
      [identity()],
      [
        {
          id: 'a1',
          principal_identity_id: 'id-1',
          assignment_type: 'active',
          member_type: 'direct',
          privilege_tier: 0,
          directory_scope_id: '/',
          first_seen_at: '2026-11-21T00:00:00.000Z',
        },
      ],
      NOW - 60_000,
    )
    expect(found).toHaveLength(1)
    expect(found[0].title).toMatch(/Tier 0/)
  })

  it('fires guest_with_role only for privileged externals', () => {
    expect(guestWithRoleCandidates([identity({ identity_class: 'external' })])).toHaveLength(1)
    expect(guestWithRoleCandidates([identity({ identity_class: 'human_internal' })])).toHaveLength(0)
    expect(guestWithRoleCandidates([identity({ is_privileged: false, identity_class: 'external' })])).toHaveLength(0)
  })

  it('fires dormant_admin after 90 days', () => {
    expect(dormantAdminCandidates([identity({ last_activity_at: '2026-08-01T00:00:00.000Z' })], NOW)).toHaveLength(1)
    expect(dormantAdminCandidates([identity()], NOW)).toHaveLength(0)
  })

  it('fires privileged_not_reviewed on a fixed 90-day cadence, not tenant reviewDays', () => {
    expect(privilegedNotReviewedCandidates([identity({ last_reviewed_at: null })], NOW)).toHaveLength(1)
    expect(privilegedNotReviewedCandidates([identity({ last_reviewed_at: '2026-08-22T00:00:00.000Z' })], NOW)).toHaveLength(1)
    expect(privilegedNotReviewedCandidates([identity({ last_reviewed_at: '2026-08-24T00:00:00.000Z' })], NOW)).toHaveLength(0)
    expect(privilegedNotReviewedCandidates([identity()], NOW)).toHaveLength(0)
    const day = 86_400_000
    const at90 = new Date(NOW - PRIVILEGED_REVIEW_DAYS * day).toISOString()
    const at90plus = new Date(NOW - PRIVILEGED_REVIEW_DAYS * day - 1).toISOString()
    const at91 = new Date(NOW - (PRIVILEGED_REVIEW_DAYS + 1) * day).toISOString()
    expect(privilegedNotReviewedCandidates([identity({ last_reviewed_at: at90 })], NOW)).toHaveLength(0)
    expect(privilegedNotReviewedCandidates([identity({ last_reviewed_at: at90plus })], NOW)).toHaveLength(0)
    expect(privilegedNotReviewedCandidates([identity({ last_reviewed_at: at91 })], NOW)).toHaveLength(1)
    expect(privilegedReviewPastCadence(at90, NOW)).toBe(false)
    expect(privilegedReviewPastCadence(at90plus, NOW)).toBe(false)
    expect(privilegedReviewPastCadence(at91, NOW)).toBe(true)
  })

  it('fires privileged_change_not_seen for standing T0 when P2 is available', () => {
    const assignment = {
      id: 'a1',
      principal_identity_id: 'id-1',
      assignment_type: 'active' as const,
      member_type: 'direct' as const,
      privilege_tier: 0 as const,
      directory_scope_id: '/',
      first_seen_at: '2026-10-01T00:00:00.000Z',
    }
    expect(privilegedChangeNotSeenCandidates([identity()], [assignment], NOW, true)).toHaveLength(1)
    expect(privilegedChangeNotSeenCandidates([identity()], [assignment], NOW, false)).toHaveLength(0)
  })
})
