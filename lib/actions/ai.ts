'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { requireIdentityId } from '@/lib/identity/governance'
import { aiExplainEnabled, explainRecommendation } from '@/lib/ai/recommend'
import { mustWrite } from '@/lib/supabase/write'
import type { Guest, RecommendedAction, RiskFactor } from '@/lib/types'

type Result =
  | { ok: true; title: string; body: string; createdAt: string }
  | { ok: false; error: string }

/**
 * On-demand explanation of the stored recommendation. Flag must be on.
 * Recommend only: no Graph writes and no remediation.
 */
export async function explainGuestRecommendation(guestId: string): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'view')
    if (!aiExplainEnabled(tenant.settings)) return { ok: false, error: 'AI explanations are off. Enable them in Settings first.' }

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
    return { ok: true, title: explanation.title, body: explanation.body, createdAt: new Date().toISOString() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't generate an explanation." }
  }
}

/**
 * Identity-level explain. Same AI flag. Writes guest_id null.
 * Recommend only: no Graph writes and no remediation.
 */
export async function explainIdentityRecommendation(identityId: string): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'view')
    if (!aiExplainEnabled(tenant.settings)) return { ok: false, error: 'AI explanations are off. Enable them in Settings first.' }

    const supabase = db()
    const { data: identity } = await supabase
      .from('identities')
      .select('id,display_name,primary_email,recommended_action,is_privileged')
      .eq('tenant_id', tenant.id)
      .eq('id', identityId)
      .is('removed_at', null)
      .maybeSingle()
    if (!identity) return { ok: false, error: 'Identity not found' }

    const { data: score } = await supabase
      .from('risk_scores')
      .select('factors')
      .eq('tenant_id', tenant.id)
      .eq('identity_id', identityId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const factors = (Array.isArray(score?.factors) ? score?.factors : []) as RiskFactor[]
    const explanation = explainRecommendation({
      recommendedAction: (identity.recommended_action as RecommendedAction) ?? 'review',
      factors,
      displayName: (identity.display_name as string | null) ?? (identity.primary_email as string | null),
      kind: identity.is_privileged ? 'privileged' : 'guest',
    })

    mustWrite(
      'recommendation_explanations insert',
      await supabase.from('recommendation_explanations').insert({
        tenant_id: tenant.id,
        identity_id: identityId,
        guest_id: null,
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
      targetLabel: (identity.primary_email as string | null) ?? (identity.display_name as string | null) ?? identityId,
      newState: { recommended_action: explanation.recommendedAction, citations: explanation.citations.map((c) => c.key) },
      reason: 'On-demand explanation. Recommend only; no access change.',
    })
    revalidatePath(`/privileged/${identityId}`)
    return { ok: true, title: explanation.title, body: explanation.body, createdAt: new Date().toISOString() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't generate an explanation." }
  }
}
