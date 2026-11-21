/** Graph $batch limit. Auth-method GETs for role holders go in chunks of 20. */
export const AUTH_METHOD_BATCH_SIZE = 20

export type AuthMethodBatchRequest = {
  id: string
  method: 'GET'
  url: string
}

export type AuthStrength = 'strong' | 'weak' | 'none'

const STRONG_AUTH_TYPES = [
  'fido2AuthenticationMethod',
  'windowsHelloForBusinessAuthenticationMethod',
  'certificateBasedAuthenticationMethod',
  'microsoftAuthenticatorAuthenticationMethod',
  'softwareOathAuthenticationMethod',
  'hardwareOathAuthenticationMethod',
]

export function authMethodType(raw: string | null | undefined) {
  return (raw ?? '').replace(/^#microsoft\.graph\./, '')
}

export function parseAuthMethodTypes(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') return null
  const value = (body as { value?: unknown }).value
  if (!Array.isArray(value)) return null
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return ''
      const typed = row as { '@odata.type'?: string; odataType?: string }
      return authMethodType(typed['@odata.type'] ?? typed.odataType ?? '')
    })
    .filter(Boolean)
}

export function authStrength(methods: string[]): AuthStrength {
  const types = methods.map(authMethodType)
  if (types.length === 0) return 'none'
  if (types.some((t) => STRONG_AUTH_TYPES.includes(t))) return 'strong'
  return 'weak'
}

export function isStrongAuth(methods: string[]) {
  return authStrength(methods) === 'strong'
}

/** Relative Graph GET URLs only. Chunked by the caller at AUTH_METHOD_BATCH_SIZE. */
export function authMethodBatchRequests(userIds: string[]): AuthMethodBatchRequest[] {
  return userIds.map((userId, index) => ({
    id: String(index),
    method: 'GET',
    url: `/users/${userId}/authentication/methods`,
  }))
}

export function chunkAuthMethodRequests(userIds: string[], size = AUTH_METHOD_BATCH_SIZE) {
  const out: AuthMethodBatchRequest[][] = []
  for (let i = 0; i < userIds.length; i += size) {
    out.push(
      userIds.slice(i, i + size).map((userId, j) => ({
        id: String(j),
        method: 'GET' as const,
        url: `/users/${userId}/authentication/methods`,
      })),
    )
  }
  return out
}
