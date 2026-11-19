import { describe, expect, it } from 'vitest'
import { requireQueryRow } from '@/lib/data/read'

describe('requireQueryRow', () => {
  it('returns data when the read succeeded', () => {
    expect(requireQueryRow('recommendation_explanations', { error: null, data: { id: 'e1' } })).toEqual({ id: 'e1' })
    expect(requireQueryRow('recommendation_explanations', { error: null, data: null })).toBeNull()
  })

  it('throws when supabase reports an error instead of hiding the explanation', () => {
    expect(() => requireQueryRow('recommendation_explanations', { error: { message: 'permission denied' }, data: null })).toThrow(
      'recommendation_explanations: permission denied',
    )
  })
})
