export type AuthMethodsStatus = 'unknown' | 'none' | 'present'

export type AuthMethodsFetch = { known: true; methods: string[] } | { known: false; methods: []; reason: string }

export function authMethodsFromGraphValue(value: { '@odata.type': string }[]): AuthMethodsFetch {
  return { known: true, methods: value.map((m) => m['@odata.type'].replace('#microsoft.graph.', '')) }
}

export function authMethodsFromGraphFailure(err: { status?: number; code?: string }): AuthMethodsFetch {
  const reason = `Graph ${err.status ?? 'error'}${err.code ? ` ${err.code}` : ''}`
  return { known: false, methods: [], reason }
}

/**
 * Empty methods are unknown unless the caller marks them as a completed fetch.
 * Live scans never call UserAuthenticationMethod.Read.All, so the stored
 * jsonb default `[]` must not be scored as "no MFA".
 */
export function authMethodsStatus(methods: string[] | null | undefined, known?: boolean): AuthMethodsStatus {
  const list = methods ?? []
  if (known === true) return list.length === 0 ? 'none' : 'present'
  if (list.length > 0) return 'present'
  return 'unknown'
}

export function describeAuthMethods(methods: string[] | null | undefined, known?: boolean): { status: AuthMethodsStatus; label: string } {
  const status = authMethodsStatus(methods, known)
  if (status === 'present') {
    const list = (methods ?? []).map((m) => m.replace('AuthenticationMethod', ''))
    return { status, label: list.join(', ') }
  }
  if (status === 'none') return { status, label: 'None registered' }
  return { status, label: 'Unknown' }
}
