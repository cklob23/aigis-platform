import 'server-only'
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose'
import { headers } from 'next/headers'
import { env } from '@/lib/env'
import { decryptSecret, encryptSecret } from '@/lib/auth/crypto'

export const LOGIN_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read']

const JWKS = createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'))

export async function appOrigin() {
  if (env.microsoftRedirectUri) return new URL(env.microsoftRedirectUri).origin
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  return `${proto}://${host}`
}

export async function loginRedirectUri() {
  if (env.microsoftRedirectUri) return env.microsoftRedirectUri
  return `${await appOrigin()}/api/auth/microsoft/callback`
}

export async function consentRedirectUri() {
  return `${await appOrigin()}/api/auth/microsoft/consent`
}

/** Absolute URL on the public origin — never on the sandbox-internal `req.url` host. */
export async function absoluteUrl(path: string) {
  return new URL(path, await appOrigin())
}

/**
 * OAuth round-trip state. The nonce + PKCE verifier are sealed into the `state`
 * parameter itself (AES-GCM, 10 minute TTL), so the callback can be validated even
 * when the browser drops the cookie (third-party iframe, partitioned storage).
 * When the cookie does survive, it is additionally checked for CSRF binding.
 */
const STATE_TTL_MS = 10 * 60 * 1000

export function sealOAuthState(payload: { nonce: string; verifier?: string; purpose: 'login' | 'consent'; returnTo?: string }) {
  return encryptSecret(JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS }))
}

export function openOAuthState(state: string | null, purpose: 'login' | 'consent') {
  if (!state) return null
  try {
    const parsed = JSON.parse(decryptSecret(state)) as { nonce: string; verifier?: string; purpose: string; exp: number; returnTo?: string }
    if (parsed.purpose !== purpose || parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function buildAuthorizeUrl(opts: { state: string; codeChallenge: string; redirectUri: string; loginHint?: string }) {
  const url = new URL('https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize')
  url.searchParams.set('client_id', env.microsoftClientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', LOGIN_SCOPES.join(' '))
  url.searchParams.set('state', opts.state)
  url.searchParams.set('code_challenge', opts.codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint)
  return url.toString()
}

export function buildAdminConsentUrl(opts: { msTenantId: string; state: string; redirectUri: string }) {
  const url = new URL(`https://login.microsoftonline.com/${opts.msTenantId}/v2.0/adminconsent`)
  url.searchParams.set('client_id', env.microsoftClientId)
  url.searchParams.set('state', opts.state)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('scope', 'https://graph.microsoft.com/.default')
  return url.toString()
}

export type TokenResponse = {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  scope?: string
}

export async function exchangeCode(opts: { code: string; codeVerifier: string; redirectUri: string }) {
  const body = new URLSearchParams({
    client_id: env.microsoftClientId,
    client_secret: env.microsoftClientSecret,
    grant_type: 'authorization_code',
    code: opts.code,
    code_verifier: opts.codeVerifier,
    redirect_uri: opts.redirectUri,
    scope: LOGIN_SCOPES.join(' '),
  })
  const res = await fetch('https://login.microsoftonline.com/organizations/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string }
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? 'Token exchange failed')
  return json
}

export type IdClaims = {
  oid: string
  tid: string
  name?: string
  preferred_username?: string
  email?: string
  sub: string
}

export async function verifyIdToken(idToken: string): Promise<IdClaims> {
  const unverified = decodeJwt(idToken)
  const tid = String(unverified.tid ?? '')
  if (!tid) throw new Error('ID token missing tenant id')
  const { payload } = await jwtVerify(idToken, JWKS, {
    audience: env.microsoftClientId,
    issuer: `https://login.microsoftonline.com/${tid}/v2.0`,
  })
  return {
    oid: String(payload.oid),
    tid,
    sub: String(payload.sub),
    name: payload.name as string | undefined,
    preferred_username: payload.preferred_username as string | undefined,
    email: payload.email as string | undefined,
  }
}

/** Client-credentials token for app-only Graph access. Cached per tenant in memory. */
const appTokenCache = new Map<string, { token: string; expiresAt: number }>()

export async function getAppOnlyToken(msTenantId: string) {
  const cached = appTokenCache.get(msTenantId)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const body = new URLSearchParams({
    client_id: env.microsoftClientId,
    client_secret: env.microsoftClientSecret,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  })
  const res = await fetch(`https://login.microsoftonline.com/${msTenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string }
  if (!res.ok) {
    const err = new Error(json.error_description ?? json.error ?? 'Failed to acquire Graph token')
    ;(err as Error & { code?: string }).code = json.error
    throw err
  }
  appTokenCache.set(msTenantId, { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 })
  return json.access_token
}

export function invalidateAppToken(msTenantId: string) {
  appTokenCache.delete(msTenantId)
}

/**
 * Application permissions actually granted to the app-only token (the `roles`
 * claim). Admin consent only grants what is already declared on the app
 * registration, so this is the authoritative view of what Graph will allow.
 */
export async function getAppOnlyRoles(msTenantId: string, fresh = false): Promise<string[]> {
  if (fresh) invalidateAppToken(msTenantId)
  const token = await getAppOnlyToken(msTenantId)
  const claims = decodeJwt(token) as { roles?: string[] }
  return claims.roles ?? []
}

/** Deep link to the app registration's "API permissions" blade in the Entra admin center. */
export function entraApiPermissionsUrl() {
  return `https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/${env.microsoftClientId}`
}
