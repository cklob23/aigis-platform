import { describe, expect, it } from 'vitest'
import { causeCountsFromGuests, filterSortPageGuests, GUEST_EXPORT_PAGE_SIZE_CAP, GUEST_LIST_PAGE_SIZE_CAP } from '@/lib/guests/display'
import { privilegedGuestListFixture } from '@/lib/privileged/fixtures'

describe('guest display scoring', () => {
  it('counts causes from combined scores, not stored guest-only scores', () => {
    const guests = privilegedGuestListFixture()
    const high = causeCountsFromGuests(guests, 'high')
    expect(high.no_sponsor).toBeGreaterThan(0)
    expect(guests.some((row) => row.display_name === 'Fabrikam Vendor' && (row.risk_level === 'high' || row.risk_level === 'critical'))).toBe(true)
    expect(guests.find((row) => row.display_name === 'Jordan Hale')?.risk_score).toBe(41)
    expect(guests.filter((row) => row.identity_id === 'id-grady' || row.identity_id === 'id-vendor' || row.identity_id === 'id-morgan')).toHaveLength(3)
    const paged = filterSortPageGuests(guests, { cause: 'no_sponsor', page: 1, pageSize: 50 })
    expect(paged.guests.every((row) => row.risk_factors.some((factor) => factor.key === 'no_sponsor'))).toBe(true)
  })

  it('caps list pages at 200 and lets CSV request more', () => {
    const template = privilegedGuestListFixture()[0]!
    const many = Array.from({ length: 250 }, (_, i) => ({ ...template, id: `guest-${i}`, identity_id: `id-${i}` }))
    const listed = filterSortPageGuests(many, { page: 1, pageSize: 500 })
    expect(GUEST_LIST_PAGE_SIZE_CAP).toBe(200)
    expect(listed.pageSize).toBe(200)
    expect(listed.guests).toHaveLength(200)
    const exported = filterSortPageGuests(many, { page: 1, pageSize: many.length }, GUEST_EXPORT_PAGE_SIZE_CAP)
    expect(exported.guests).toHaveLength(250)
  })
})
