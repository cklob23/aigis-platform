'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { randomToken } from '@/lib/auth/crypto'
import { GraphClient } from '@/lib/graph/client'
import { deleteUser, removeGroupMember, removeGroupOwner, revokeSessions, setAccountEnabled } from '@/lib/graph/queries'
import { rescoreTenant } from '@/lib/scan/engine'

export type RemediationType = 'remove_from_resources' | 'disable_guest' | 'remove_all_access' | 'delete_guest'

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
    // Real tenants start in monitor-only mode: nothing is written to Entra until an
    // administrator explicitly enables enforcement in Settings. Demo tenants simulate.
    const enforcementOn = tenant.is_demo || tenant.settings.enforcement_mode === 'enforce'
    const canExecute = enforcementOn && can(session.role, 'remediation.execute')

    const { data: action } = await supabase
      .from('remediation_actions')
      .insert({
        tenant_id: tenant.id,
        guest_id: input.guestId,
        action_type: input.actionType,
        target_resources: targets.map((t) => ({ id: t.id, name: t.display_name, type: t.resource_type })),
        status: canExecute ? 'executing' : 'pending',
        requested_by: session.demo ? null : session.userId,
        reason: input.reason,
        correlation_id: correlationId,
      })
      .select('id')
      .single()

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
        message: enforcementOn
          ? 'Remediation request submitted for administrator approval.'
          : 'Recorded in the remediation queue. Enforcement is off (monitor-only), so nothing was changed in Entra.',
      }
    }

    const now = new Date().toISOString()
    const result: Record<string, unknown> = { removed: [] as string[], errors: [] as string[] }
    if (!tenant.is_demo) {
      const g = new GraphClient(tenant.ms_tenant_id)
      for (const t of targets) {
        try {
          if (t.resource_type === 'sharepoint_site' || t.resource_type === 'enterprise_app') continue
          const ownerRow = (memberships ?? []).find((m) => m.id === t.membershipId) as { membership_type?: string } | undefined
          if (ownerRow?.membership_type === 'owner') await removeGroupOwner(g, t.ms_object_id, guest.ms_object_id).catch(() => undefined)
          await removeGroupMember(g, t.ms_object_id, guest.ms_object_id)
          ;(result.removed as string[]).push(t.display_name)
        } catch (err) {
          ;(result.errors as string[]).push(`${t.display_name}: ${err instanceof Error ? err.message : 'failed'}`)
        }
      }
      if (input.actionType === 'disable_guest' || input.actionType === 'remove_all_access') {
        await setAccountEnabled(g, guest.ms_object_id, false)
        await revokeSessions(g, guest.ms_object_id).catch(() => undefined)
      }
      if (input.actionType === 'delete_guest') await deleteUser(g, guest.ms_object_id)
    } else {
      result.removed = targets.map((t) => t.display_name)
      result.simulated = true
    }

    if (targets.length) await supabase.from('resource_memberships').update({ removed_at: now }).in('id', targets.map((t) => t.membershipId))
    for (const t of targets) {
      const { data: r } = await supabase.from('resources').select('external_member_count').eq('id', t.id).single()
      await supabase.from('resources').update({ external_member_count: Math.max(0, (r?.external_member_count ?? 1) - 1) }).eq('id', t.id)
    }
    const guestUpdate: Record<string, unknown> = {}
    if (input.actionType === 'disable_guest' || input.actionType === 'remove_all_access') guestUpdate.account_enabled = false
    if (input.actionType === 'delete_guest') {
      guestUpdate.removed_at = now
      guestUpdate.review_status = 'removed'
    }
    if (input.actionType === 'remove_all_access') guestUpdate.review_status = 'removed'
    if (Object.keys(guestUpdate).length) await supabase.from('guest_identities').update(guestUpdate).eq('id', input.guestId)
    await supabase.from('guest_activity').insert({ tenant_id: tenant.id, guest_id: input.guestId, activity_type: input.actionType === 'delete_guest' ? 'disabled' : 'membership_removed', details: { action: input.actionType, resources: result.removed, by: session.email } })
    await supabase.from('remediation_actions').update({ status: (result.errors as string[]).length ? 'failed' : 'completed', executed_at: now, result }).eq('id', action!.id)
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
    if (!tenant.is_demo && tenant.settings.enforcement_mode !== 'enforce') {
      return { ok: false, error: 'Enforcement is off. Enable it in Settings → General before approving changes to Entra.' }
    }
    await db().from('remediation_actions').update({ status: 'cancelled' }).eq('id', actionId)
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
