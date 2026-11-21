import { NextResponse, type NextRequest } from 'next/server'
import { absoluteUrl, exchangeCode, loginRedirectUri, openOAuthState, verifyIdToken } from '@/lib/auth/microsoft'
import { safeAppPath } from '@/lib/auth/next-path'
import { createSession } from '@/lib/auth/session'
import { encryptSecret } from '@/lib/auth/crypto'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import type { RoleKey } from '@/lib/auth/rbac'
import { mustWrite } from '@/lib/supabase/write'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const code = params.get('code')
  const error = params.get('error')
  const sealed = openOAuthState(params.get('state'), 'login')
  const cookieNonce = req.cookies.get('gs_oauth_nonce')?.value

  const fail = async (reason: string) => {
    const res = NextResponse.redirect(await absoluteUrl(`/auth/login?error=${encodeURIComponent(reason)}`))
    res.cookies.delete('gs_oauth_nonce')
    return res
  }

  if (error) return fail(params.get('error_description') ?? error)
  if (!code || !sealed?.verifier) return fail('invalid_state')
  // The cookie is a secondary CSRF binding; if the browser kept it, it must match.
  if (cookieNonce && cookieNonce !== sealed.nonce) return fail('invalid_state')
  const verifier = sealed.verifier

  try {
    const tokens = await exchangeCode({ code, codeVerifier: verifier, redirectUri: await loginRedirectUri() })
    if (!tokens.id_token) return fail('missing_id_token')
    const claims = await verifyIdToken(tokens.id_token)
    const email = (claims.email ?? claims.preferred_username ?? '').toLowerCase()
    const name = claims.name ?? email

    const supabase = db()
    const { data: user, error: userErr } = await supabase
      .from('users')
      .upsert({ ms_object_id: claims.oid, ms_tenant_id: claims.tid, email, display_name: name, last_login_at: new Date().toISOString() }, { onConflict: 'ms_object_id' })
      .select('id')
      .single()
    if (userErr || !user) return fail('user_upsert_failed')

    let { data: tenant } = await supabase.from('tenants').select('id,organization_id').eq('ms_tenant_id', claims.tid).maybeSingle()
    let role: RoleKey = 'read_only'
    if (!tenant) {
      // First sign-in from this Microsoft tenant: bootstrap organization + tenant; the first user becomes admin.
      const { data: org } = mustWrite(
        'organizations insert',
        await supabase.from('organizations').insert({ name: email.split('@')[1] ?? 'New organization' }).select('id').single(),
      )
      if (!org?.id) throw new Error('organizations insert: missing id')
      try {
        const { data: created } = mustWrite(
          'tenants insert',
          await supabase
            .from('tenants')
            .insert({ organization_id: org.id, ms_tenant_id: claims.tid, display_name: email.split('@')[1] ?? 'Microsoft 365 tenant', connection_status: 'consent_required' })
            .select('id,organization_id')
            .single(),
        )
        if (!created?.id) throw new Error('tenants insert: missing id')
        mustWrite(
          'subscriptions insert',
          await supabase.from('subscriptions').insert({ organization_id: org.id, plan: 'trial', status: 'active', current_period_end: new Date(Date.now() + 14 * 86_400_000).toISOString() }),
        )
        tenant = created
        mustWrite(
          'administrators insert',
          await supabase.from('administrators').insert({ tenant_id: tenant.id, user_id: user.id, role_key: 'gs_admin' }),
        )
      } catch (err) {
        try {
          await supabase.from('tenants').delete().eq('organization_id', org.id)
        } catch {
          // Keep the original bootstrap error.
        }
        try {
          await supabase.from('organizations').delete().eq('id', org.id)
        } catch {
          // Keep the original bootstrap error.
        }
        throw err
      }
      role = 'gs_admin'
      await audit({ tenantId: tenant.id, userId: user.id, email }, { action: 'tenant.created', targetType: 'tenant', targetId: tenant.id, targetLabel: claims.tid })
    } else {
      const { data: admin } = await supabase.from('administrators').select('role_key').eq('tenant_id', tenant.id).eq('user_id', user.id).maybeSingle()
      if (!admin) {
        const { count } = await supabase.from('administrators').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id)
        if ((count ?? 0) === 0) {
          mustWrite(
            'administrators insert',
            await supabase.from('administrators').insert({ tenant_id: tenant.id, user_id: user.id, role_key: 'gs_admin' }),
          )
          role = 'gs_admin'
        } else {
          return fail('not_an_administrator')
        }
      } else role = admin.role_key as RoleKey
    }

    if (tokens.refresh_token) {
      mustWrite(
        'oauth_tokens upsert',
        await supabase.from('oauth_tokens').upsert(
          {
            tenant_id: tenant!.id,
            user_id: user.id,
            provider: 'microsoft',
            encrypted_refresh_token: encryptSecret(tokens.refresh_token),
            scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
            expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,user_id,provider' },
        ),
      )
    }

    await createSession({ userId: user.id, email, name, tenantId: tenant!.id, msTenantId: claims.tid, role, demo: false })
    await audit({ tenantId: tenant!.id, userId: user.id, email }, { action: 'auth.signed_in', targetType: 'user', targetId: user.id, targetLabel: email })

    const { data: onboarding } = await supabase.from('tenants').select('onboarding_completed_at').eq('id', tenant!.id).single()
    const destination = onboarding?.onboarding_completed_at
      ? (safeAppPath(sealed.returnTo) ?? '/dashboard')
      : '/onboarding'
    const res = NextResponse.redirect(await absoluteUrl(destination))
    res.cookies.delete('gs_oauth_nonce')
    return res
  } catch (err) {
    console.log('[v0] Microsoft callback failed:', err instanceof Error ? err.message : err)
    return fail(err instanceof Error ? err.message : 'callback_failed')
  }
}
