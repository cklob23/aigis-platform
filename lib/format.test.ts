import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTimeEt } from '@/lib/format'

describe('formatDate', () => {
  it('keeps UTC midnight values on their calendar day in every timezone', () => {
    expect(formatDate('2026-07-01T00:00:00.000Z')).toBe('Jul 1, 2026')
    expect(formatDate('2026-12-11T00:00:00.000Z')).toBe('Dec 11, 2026')
    expect(formatDate('2026-09-12T00:00:00.000Z')).toBe('Sep 12, 2026')
    expect(formatDate('2026-07-01')).toBe('Jul 1, 2026')
  })

  it('formats clock times in Eastern Time with an ET label', () => {
    expect(formatDateTimeEt('2026-11-18T10:04:00.000Z')).toBe('Nov 18, 2026, 5:04 AM ET')
  })

  it('uses None when the clock time is missing', () => {
    expect(formatDateTimeEt(null)).toBe('None')
    expect(formatDateTimeEt(undefined)).toBe('None')
    expect(formatDateTimeEt('not-a-date')).toBe('None')
  })
})
