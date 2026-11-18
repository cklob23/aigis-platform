import 'server-only'
import { headers } from 'next/headers'
import { db } from '@/lib/supabase/admin'
import type { Session } from '@/lib/auth/session'
import { mustWrite } from '@/lib/supabase/write'

export type AuditInput = {
  action: string
  targetType?: string
  targetId?: string
  targetLabel?: string
  previousState?: unknown
  newState?: unknown
  reason?: string
  correlationId?: string
}

export async function audit(session: Pick<Session, 'tenantId' | 'userId' | 'email'> | null, input: AuditInput) {
  let ip: string | null = null
  try {
    const h = await headers()
    ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  } catch {
    ip = null
  }
  mustWrite(
    'audit_events insert',
    await db().from('audit_events').insert({
    tenant_id: session?.tenantId ?? null,
    actor_user_id: session?.userId || null,
    actor_email: session?.email ?? 'system',
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ?? null,
    previous_state: input.previousState ?? null,
    new_state: input.newState ?? null,
    reason: input.reason ?? null,
    source_ip: ip,
    correlation_id: input.correlationId ?? null,
  }),
  )
}
