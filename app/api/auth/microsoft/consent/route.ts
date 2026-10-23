import { NextResponse, type NextRequest } from 'next/server'
import { absoluteUrl, buildAdminConsentUrl, consentRedirectUri, invalidateAppToken, openOAuthState, sealOAuthState } from '@/lib/auth/microsoft'
import { readSession } from '@/lib/auth/session'
import { randomToken } from '@/lib/auth/crypto'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'

/** Only same-origin app paths may be used as a post-consent destination. */
function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

/** GET without params → start consent. GET with admin_consent → callback from Microsoft. */
export async function GET(req: NextRequest) {
  const session = await readSession()
  if (!session) return NextResponse.redirect(await absoluteUrl('/auth/login'))
  const params = req.nextUrl.searchParams

  if (params.has('admin_consent') || params.has('error')) {
    const ok = params.get('admin_consent') === 'True'
    const sealed = openOAuthState(params.get('state'), 'consent')
    const cookieNonce = req.cookies.get('gs_consent_nonce')?.value
    const stateOk = Boolean(sealed) && (!cookieNonce || cookieNonce === sealed!.nonce)
    const granted = ok && stateOk && params.get('tenant') === session.msTenantId
    const reason = params.get('error_description') ?? (stateOk ? 'consent_failed' : 'invalid_state')
    const returnTo = safeReturnPath(sealed?.returnTo ?? null)
    const destination = returnTo
      ? `${returnTo}${returnTo.includes('?') ? '&' : '?'}consent=${granted ? 'granted' : 'denied'}`
      : granted
        ? '/onboarding?step=2&consent=granted'
        : `/onboarding?step=2&consent=denied&reason=${encodeURIComponent(reason)}`
    const res = NextResponse.redirect(await absoluteUrl(destination))
    res.cookies.delete('gs_consent_nonce')
    if (granted) {
      // Drop the cached app-only token so newly consented permissions show up immediately
      // instead of after the old token's expiry (~1 hour).
      invalidateAppToken(session.msTenantId)
      await db()
        .from('tenants')
        .update({ connection_status: 'connected', consent_granted_at: new Date().toISOString(), ...(returnTo ? {} : { onboarding_step: 3 }) })
        .eq('id', session.tenantId)
      await audit(session, { action: 'tenant.consent_granted', targetType: 'tenant', targetId: session.tenantId })
    }
    return res
  }

  const nonce = randomToken(16)
  const returnTo = safeReturnPath(params.get('return'))
  const state = sealOAuthState({ nonce, purpose: 'consent', returnTo: returnTo ?? undefined })
  const url = buildAdminConsentUrl({ msTenantId: session.msTenantId, state, redirectUri: await consentRedirectUri() })
  const res = NextResponse.redirect(url)
  res.cookies.set('gs_consent_nonce', nonce, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 600 })
  return res
}
