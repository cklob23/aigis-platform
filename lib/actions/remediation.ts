'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { randomToken } from '@/lib/auth/crypto'
import { rescoreTenant } from '@/lib/scan/engine'
import { requireIdentityId } from '@/lib/identity/governance'
import { mustWrite, type WriteTask } from '@/lib/supabase/write'
import { persistRemediationEffects, requireRemediationAction } from '@/lib/remediation/persist'
import { canExecuteEntraWrites, LIVE_ENTRA_WRITES_DISABLED, type RemediationType } from '@/lib/remediation/entra-writes'

export type { RemediationType }

type Result = { ok: true; message: string; status: string } | { ok: false; error: string }

/**
 * Requests (and, when the caller may execute, performs) a remediation.
 * Analysts create a pending request; admins execute immediately.
 */
export async function remediateGuest(input: { guestId: string; actionType: RemediationType; resourceIds?: string[]; reason: string; confirmText?: string }): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'remediation.request')
    if (!input.reason.trim()) return { ok: false, error: 'A reason is required for the audit trail.' }
    const supabase = db()
    const { data: guest } = await supabase.from('guest_identities').select('*').eq('tenant_id', tenant.id).eq('id', input.guestId).single()
    if (!guest) return { ok: false, error: 'Guest not found' }
    if (input.actionType === 'delete_guest' && input.confirmText !== (guest.email ?? guest.display_name)) {
      return { ok: false, error: 'Confirmation text does not match the guest email.' }
    }

    const { data: memberships } = await supabase.from('resource_memberships').select('id,resource_id, resource:resources(id,ms_object_id,display_name,resource_type)').eq('tenant_id', tenant.id).eq('guest_id', input.guestId).is('removed_at', null)
    const targets = (memberships ?? [])
      .map((m) => ({ membershipId: m.id as string, ...(m.resource as unknown as { id: string; ms_object_id: string; display_name: string; resource_type: string }) }))
      .filter((t) => (input.actionType === 'remove_from_resources' ? input.resourceIds?.includes(t.id) : true))
    const correlationId = randomToken(8)
    // Live tenants never call Graph writes: consent requests read scopes only.
    // Demo tenants still simulate local inventory updates.
    const canExecute = canExecuteEntraWrites(tenant) && can(session.role, 'remediation.execute')

    const identityId = requireIdentityId(guest)
    const action = requireRemediationAction(
      await supabase
        .from('remediation_actions')
        .insert({
          tenant_id: tenant.id,
          guest_id: input.guestId,
          identity_id: identityId,
          action_type: input.actionType,
          target_resources: targets.map((t) => ({ id: t.id, name: t.display_name, type: t.resource_type })),
          status: canExecute ? 'executing' : 'pending',
          requested_by: session.demo ? null : session.userId,
          reason: input.reason,
          correlation_id: correlationId,
        })
        .select('id')
        .single(),
    )

    await audit(session, {
      action: canExecute ? 'remediation.executing' : 'remediation.requested',
      targetType: 'guest',
      targetId: input.guestId,
      targetLabel: guest.email ?? guest.display_name,
      newState: { action_type: input.actionType, resources: targets.map((t) => t.display_name) },
      reason: input.reason,
      correlationId,
    })

    if (!canExecute) {
      revalidatePath(`/guests/${input.guestId}`)
      return {
        ok: true,
        status: 'pending',
        message: canExecuteEntraWrites(tenant)
          ? 'Remediation request submitted for administrator approval.'
          : 'Recorded in the remediation queue. Nothing was changed in Entra. Make the change in Microsoft 365 and confirm it on the next scan.',
      }
    }

    const now = new Date().toISOString()
    const result: Record<string, unknown> = { removed: [] as string[], errors: [] as string[] }
    if (!canExecuteEntraWrites(tenant)) {
      throw new Error(LIVE_ENTRA_WRITES_DISABLED)
    }
    result.removed = targets.map((t) => t.display_name)
    result.simulated = true

    const guestUpdate: Record<string, unknown> = {}
    if (input.actionType === 'disable_guest' || input.actionType === 'remove_all_access') guestUpdate.account_enabled = false
    if (input.actionType === 'delete_guest') {
      guestUpdate.removed_at = now
      guestUpdate.review_status = 'removed'
    }
    if (input.actionType === 'remove_all_access') guestUpdate.review_status = 'removed'
    const effectWrites: Array<{ label: string; run: () => WriteTask }> = []
    if (targets.length) {
      effectWrites.push({
        label: 'resource_memberships soft-remove',
        run: () => supabase.from('resource_memberships').update({ removed_at: now }).in('id', targets.map((t) => t.membershipId)),
      })
    }
    for (const t of targets) {
      effectWrites.push({
        label: `resources member count ${t.id}`,
        run: async () => {
          const { data: r } = await supabase.from('resources').select('external_member_count').eq('id', t.id).single()
          return await supabase.from('resources').update({ external_member_count: Math.max(0, (r?.external_member_count ?? 1) - 1) }).eq('id', t.id)
        },
      })
    }
    if (Object.keys(guestUpdate).length) {
      effectWrites.push({
        label: 'guest_identities remediation',
        run: () => supabase.from('guest_identities').update(guestUpdate).eq('id', input.guestId),
      })
    }
    effectWrites.push({
      label: 'guest_activity insert',
      run: () =>
        supabase.from('guest_activity').insert({
          tenant_id: tenant.id,
          guest_id: input.guestId,
          identity_id: identityId,
          activity_type: input.actionType === 'delete_guest' ? 'disabled' : 'membership_removed',
          details: { action: input.actionType, resources: result.removed, by: session.email },
        }),
    })
    effectWrites.push({
      label: 'remediation_actions complete',
      run: () =>
        supabase
          .from('remediation_actions')
          .update({ status: (result.errors as string[]).length ? 'failed' : 'completed', executed_at: now, result })
          .eq('id', action.id),
    })
    await persistRemediationEffects(effectWrites, (message) =>
      supabase.from('remediation_actions').update({ status: 'failed', executed_at: now, result: { ...result, write_error: message } }).eq('id', action.id),
    )
    await audit(session, { action: 'remediation.executed', targetType: 'guest', targetId: input.guestId, targetLabel: guest.email ?? guest.display_name, previousState: { memberships: targets.length, account_enabled: guest.account_enabled }, newState: { ...result, ...guestUpdate }, reason: input.reason, correlationId })
    await rescoreTenant(tenant.id, null)

    revalidatePath(`/guests/${input.guestId}`)
    revalidatePath('/guests')
    revalidatePath('/dashboard')
    const removedCount = (result.removed as string[]).length
    const label =
      input.actionType === 'delete_guest'
        ? 'Guest deleted from the directory'
        : input.actionType === 'disable_guest'
          ? 'Guest disabled and sessions revoked'
          : `Removed from ${removedCount} resource${removedCount === 1 ? '' : 's'}`
    return { ok: true, status: 'completed', message: `${label}${tenant.is_demo ? ' (simulated in demo)' : ''}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Remediation failed' }
  }
}

export async function approvePendingRemediation(actionId: string): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'remediation.execute')
    const { data: action } = await db().from('remediation_actions').select('*').eq('tenant_id', tenant.id).eq('id', actionId).single()
    if (!action || action.status !== 'pending') return { ok: false, error: 'Request is no longer pending' }
    if (!canExecuteEntraWrites(tenant)) {
      return { ok: false, error: LIVE_ENTRA_WRITES_DISABLED }
    }
    mustWrite(
      'remediation_actions cancel',
      await db().from('remediation_actions').update({ status: 'cancelled' }).eq('id', actionId),
    )
    return remediateGuest({
      guestId: action.guest_id,
      actionType: action.action_type,
      resourceIds: (action.target_resources as { id: string }[]).map((t) => t.id),
      reason: `Approved request ${action.correlation_id}: ${action.reason ?? ''}`,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Approval failed' }
  }
}
