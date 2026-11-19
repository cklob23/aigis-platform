import { timingSafeEqual } from 'node:crypto'

export type CronAuth =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string }

function bearerMatches(header: string | null, secret: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false
  const got = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

/**
 * Fail closed. An unset CRON_SECRET must not let the sweep run.
 * Wrong or missing Bearer token is unauthorized.
 */
export function authorizeCron(secret: string | undefined, authorizationHeader: string | null): CronAuth {
  if (!secret) return { ok: false, status: 503, error: 'cron_not_configured' }
  if (!bearerMatches(authorizationHeader, secret)) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true }
}
