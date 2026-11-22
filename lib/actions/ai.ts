'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { requireIdentityId } from '@/lib/identity/governance'
import { aiExplainEnabled, explainRecommendation } from '@/lib/ai/recommend'
import { getPrivilegedIdentity } from '@/lib/data/privileged'
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

    const profile = await getPrivilegedIdentity(tenant.id, session.role, tenant.settings, identityId, {
      isDemo: session.demo,
    })
    if (!profile) return { ok: false, error: 'Identity not found' }

    const supabase = db()
    const explanation = explainRecommendation({
      recommendedAction: profile.recommendedAction,
      factors: profile.factors,
      displayName: profile.displayName ?? profile.email,
      kind: 'privileged',
      assignments: profile.assignments.map((row) => ({
        roleName: row.roleName,
        recommendedChange: row.recommendedChange,
      })),
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
      targetLabel: profile.email ?? profile.displayName ?? identityId,
      newState: { recommended_action: explanation.recommendedAction, citations: explanation.citations.map((c) => c.key) },
      reason: 'On-demand explanation. Recommend only; no access change.',
    })
    revalidatePath(`/privileged/${identityId}`)
    return { ok: true, title: explanation.title, body: explanation.body, createdAt: new Date().toISOString() }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't generate an explanation." }
  }
}
