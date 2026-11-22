import { describe, expect, it } from 'vitest'
import { formatDate } from '@/lib/format'

describe('formatDate', () => {
  it('keeps UTC midnight values on their calendar day in every timezone', () => {
    expect(formatDate('2026-07-01T00:00:00.000Z')).toBe('Jul 1, 2026')
    expect(formatDate('2026-12-11T00:00:00.000Z')).toBe('Dec 11, 2026')
    expect(formatDate('2026-09-12T00:00:00.000Z')).toBe('Sep 12, 2026')
    expect(formatDate('2026-07-01')).toBe('Jul 1, 2026')
  })
})
