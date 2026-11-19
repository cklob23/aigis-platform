import { describe, expect, it } from 'vitest'
import { authorizeCron } from '@/lib/cron/auth'

describe('authorizeCron', () => {
  it('rejects when CRON_SECRET is unset', () => {
    expect(authorizeCron(undefined, 'Bearer anything')).toEqual({ ok: false, status: 503, error: 'cron_not_configured' })
    expect(authorizeCron('', 'Bearer anything')).toEqual({ ok: false, status: 503, error: 'cron_not_configured' })
  })

  it('rejects a missing or wrong bearer token with 401', () => {
    expect(authorizeCron('s3cret', null)).toEqual({ ok: false, status: 401, error: 'unauthorized' })
    expect(authorizeCron('s3cret', 'Bearer other')).toEqual({ ok: false, status: 401, error: 'unauthorized' })
    expect(authorizeCron('s3cret', 's3cret')).toEqual({ ok: false, status: 401, error: 'unauthorized' })
  })

  it('allows the matching bearer token', () => {
    expect(authorizeCron('s3cret', 'Bearer s3cret')).toEqual({ ok: true })
  })
})
