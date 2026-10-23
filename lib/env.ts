import 'server-only'

export const env = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '',
  sessionSecret: process.env.SESSION_SECRET ?? process.env.SUPABASE_JWT_SECRET ?? '',
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? '',
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI ?? '',
}

/** The seeded demo tenant is opt-in once a real tenant is connected. Set GUESTSWEEP_DEMO=true to re-enable it. */
export function demoEnabled() {
  return process.env.GUESTSWEEP_DEMO === 'true'
}

export function microsoftConfigured() {
  return Boolean(env.microsoftClientId && env.microsoftClientSecret)
}
