import { NextResponse, type NextRequest } from 'next/server'
import { absoluteUrl, buildAuthorizeUrl, loginRedirectUri, sealOAuthState } from '@/lib/auth/microsoft'
import { randomToken, sha256Base64Url } from '@/lib/auth/crypto'
import { microsoftConfigured } from '@/lib/env'
import { safeAppPath } from '@/lib/auth/next-path'

export async function GET(req: NextRequest) {
  if (!microsoftConfigured()) {
    return NextResponse.redirect(await absoluteUrl('/auth/login?error=not_configured'))
  }
  const nonce = randomToken(16)
  const verifier = randomToken(48)
  const returnTo = safeAppPath(req.nextUrl.searchParams.get('next')) ?? undefined
  const state = sealOAuthState({ nonce, verifier, purpose: 'login', returnTo })
  const redirectUri = await loginRedirectUri()
  const url = buildAuthorizeUrl({ state, codeChallenge: sha256Base64Url(verifier), redirectUri })
  const res = NextResponse.redirect(url)
  res.cookies.set('gs_oauth_nonce', nonce, { httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 600 })
  return res
}
