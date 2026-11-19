import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PREFIXES = ['/auth', '/api/auth', '/api/cron', '/_next', '/favicon', '/icon', '/apple-icon', '/images']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/' || pathname === '/login' || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get('gs_session')?.value
  const secret = process.env.SESSION_SECRET ?? process.env.SUPABASE_JWT_SECRET ?? ''
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { issuer: 'guestsweep' })
      return NextResponse.next()
    } catch {
      // fall through to redirect
    }
  }
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const login = new URL('/auth/login', req.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|svg|jpg|jpeg|ico|webp)$).*)'],
}
