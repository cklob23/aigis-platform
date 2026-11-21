import { describe, expect, it } from 'vitest'
import {
  AUTH_METHOD_BATCH_SIZE,
  authMethodBatchRequests,
  authStrength,
  chunkAuthMethodRequests,
  isStrongAuth,
  parseAuthMethodTypes,
} from '@/lib/risk/auth-methods'

describe('auth-methods', () => {
  it('builds GET-only $batch requests of 20', () => {
    expect(AUTH_METHOD_BATCH_SIZE).toBe(20)
    const ids = Array.from({ length: 21 }, (_, i) => `user-${i}`)
    const chunks = chunkAuthMethodRequests(ids)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(20)
    expect(chunks[1]).toHaveLength(1)
    for (const req of chunks.flat()) {
      expect(req.method).toBe('GET')
      expect(req.url).toMatch(/^\/users\/user-\d+\/authentication\/methods$/)
    }
    expect(authMethodBatchRequests(['abc'])[0]).toEqual({
      id: '0',
      method: 'GET',
      url: '/users/abc/authentication/methods',
    })
  })

  it('parses Graph method types and classifies strength', () => {
    expect(parseAuthMethodTypes(null)).toBeNull()
    expect(parseAuthMethodTypes({ value: [{ '@odata.type': '#microsoft.graph.passwordAuthenticationMethod' }] })).toEqual([
      'passwordAuthenticationMethod',
    ])
    expect(authStrength([])).toBe('none')
    expect(authStrength(['passwordAuthenticationMethod'])).toBe('weak')
    expect(isStrongAuth(['microsoftAuthenticatorAuthenticationMethod'])).toBe(true)
    expect(isStrongAuth(['fido2AuthenticationMethod'])).toBe(true)
  })
})
