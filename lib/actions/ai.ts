'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { requireIdentityId } from '@/lib/identity/governance'
import { explainRecommendation, parseAiSettings } from '@/lib/ai/recommend'
import { mustWrite } from '@/lib/supabase/write'
import type { Guest } from '@/lib/types'

type Result =
  | { ok: true; title: string; body: string }
  | { ok: false; error: string }

/**
 * On-demand explanation of the stored recommendation. Flag must be on.
 * Recommend only: no Graph writes and no remediation.
 */
export async function explainGuestRecommendation(guestId: string): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'view')
    const ai = parseAiSettings(tenant.settings)
    if (!ai.enabled) return { ok: false, error: 'AI explanations are off. Enable them in Settings first.' }
    if (ai.mode !== 'on_demand') return { ok: false, error: 'AI explanations only run on demand.' }

    const { data: guest } = await db()
      .from('guest_identities')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('id', guestId)
      .maybeSingle()
    if (!guest) return { ok: false, error: 'Identity not found' }

    const g = guest as Guest
    const identityId = requireIdentityId(g)
    const explanation = explainRecommendation({
      recommendedAction: g.recommended_action,
      factors: g.risk_factors ?? [],
      displayName: g.display_name ?? g.email,
    })

    mustWrite(
      'recommendation_explanations insert',
      await db().from('recommendation_explanations').insert({
        tenant_id: tenant.id,
        identity_id: identityId,
        guest_id: g.id,
        recommended_action: explanation.recommendedAction,
        explanation: explanation.body,
        citations: explanation.citations,
        created_by: session.demo ? null : session.userId,
      }),
    )

    await audit(session, {
      action: 'ai.explained',
      targetType: 'identity',
      targetId: identityId,
      targetLabel: g.email ?? g.display_name ?? guestId,
      newState: { recommended_action: explanation.recommendedAction, citations: explanation.citations.map((c) => c.key) },
      reason: 'On-demand explanation. Recommend only; no access change.',
    })
    revalidatePath(`/guests/${g.id}`)
    return { ok: true, title: explanation.title, body: explanation.body }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not explain this recommendation' }
  }
}
