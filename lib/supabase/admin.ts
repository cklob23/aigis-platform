import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

let client: SupabaseClient | null = null

/**
 * Service-role client. RLS is deny-all on every AIGIS table, so this is the
 * only path to data. Every query MUST scope by tenant_id from the verified session.
 */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
