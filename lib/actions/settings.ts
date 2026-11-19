'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireContext, assertCan } from '@/lib/auth/current'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { rescoreTenant, generateFindings } from '@/lib/scan/engine'
import { resetDemoTenant } from '@/lib/demo/seed'
import { createSession } from '@/lib/auth/session'
import type { RoleKey } from '@/lib/auth/rbac'
import { mergeAiSettings, parseAiSettings } from '@/lib/ai/recommend'
import { mustWrite } from '@/lib/supabase/write'
import { canExecuteEntraWrites, LIVE_ENTRA_WRITES_DISABLED } from '@/lib/remediation/entra-writes'

type Result = { ok: true; message?: string } | { ok: false; error: string }
const fail = (err: unknown): Result => ({ ok: false, error: err instanceof Error ? err.message : 'Something went wrong' })

export async function updateRiskPolicy(input: { inactiveDays: number; staleDays: number; reviewDays: number }): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    const prev = (tenant.settings.risk_policy as Record<string, number>) ?? {}
    const settings = { ...tenant.settings, risk_policy: input }
    mustWrite('tenants risk_policy', await db().from('tenants').update({ settings }).eq('id', tenant.id))
    await audit(session, { action: 'policy.updated', targetType: 'tenant', targetId: tenant.id, targetLabel: 'Risk thresholds', previousState: prev, newState: input })
    await rescoreTenant(tenant.id, null, input)
    await generateFindings(tenant.id)
    revalidatePath('/settings')
    revalidatePath('/guests')
    revalidatePath('/dashboard')
    return { ok: true, message: 'Risk thresholds saved and guests re-scored' }
  } catch (err) {
    return fail(err)
  }
}

export async function updateEnforcementMode(mode: 'monitor' | 'enforce'): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'settings.manage')
    if (mode === 'enforce' && !canExecuteEntraWrites(tenant)) {
      return { ok: false, error: LIVE_ENTRA_WRITES_DISABLED }
    }
    const prev = tenant.settings.enforcement_mode ?? 'monitor'
    mustWrite(
      'tenants enforcement_mode',
      await db().from('tenants').update({ settings: { ...tenant.settings, enforcement_mode: mode } }).eq('id', tenant.id),
    )
    await audit(session, {
      action: mode === 'enforce' ? 'settings.enforcement_enabled' : 'settings.enforcement_disabled',
      targetType: 'tenant',
      targetId: tenant.id,
      previousState: { enforcement_mode: prev },
      newState: { enforcement_mode: mode },
    })
    revalidatePath('/settings')
    revalidatePath('/', 'layout')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update enforcement mode' }
  }
}

export async function updateAiSettings(enabled: boolean): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'settings.manage')
    const prev = parseAiSettings(tenant.settings)
    const settings = mergeAiSettings(tenant.settings, enabled)
    mustWrite('tenants ai_settings', await db().from('tenants').update({ settings }).eq('id', tenant.id))
    await audit(session, {
      action: enabled ? 'settings.ai_enabled' : 'settings.ai_disabled',
      targetType: 'tenant',
      targetId: tenant.id,
      previousState: { ai: prev, enforcement_mode: tenant.settings.enforcement_mode ?? 'monitor' },
      newState: { ai: settings.ai, enforcement_mode: tenant.settings.enforcement_mode ?? 'monitor' },
    })
    revalidatePath('/settings')
    revalidatePath('/guests')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to update AI settings' }
  }
}

export async function updateNotificationSettings(input: { email: boolean; weeklyDigest: boolean; scanSchedule: 'daily' | 'weekly' | 'manual' }): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'settings.manage')
    const settings = { ...tenant.settings, notifications: { email: input.email, weekly_digest: input.weeklyDigest }, scan_schedule: input.scanSchedule }
    mustWrite('tenants notifications', await db().from('tenants').update({ settings }).eq('id', tenant.id))
    await audit(session, { action: 'settings.updated', targetType: 'tenant', targetId: tenant.id, newState: input })
    revalidatePath('/settings')
    return { ok: true, message: 'Settings saved' }
  } catch (err) {
    return fail(err)
  }
}

export async function togglePolicy(policyId: string, enabled: boolean): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    mustWrite('policies toggle', await db().from('policies').update({ enabled }).eq('tenant_id', tenant.id).eq('id', policyId))
    await audit(session, { action: 'policy.toggled', targetType: 'policy', targetId: policyId, newState: { enabled } })
    revalidatePath('/settings/policies')
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function setResourceSensitivity(resourceId: string, isSensitive: boolean, category: string | null): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'policy.manage')
    const { data: prev } = await db().from('resources').select('display_name,is_sensitive,sensitivity_category').eq('tenant_id', tenant.id).eq('id', resourceId).single()
    mustWrite(
      'resources sensitivity',
      await db().from('resources').update({ is_sensitive: isSensitive, sensitivity_category: isSensitive ? category : null }).eq('tenant_id', tenant.id).eq('id', resourceId),
    )
    const overrides = { ...((tenant.settings.sensitivity_overrides as Record<string, string | null>) ?? {}), [prev?.display_name ?? resourceId]: isSensitive ? category : null }
    mustWrite(
      'tenants sensitivity_overrides',
      await db().from('tenants').update({ settings: { ...tenant.settings, sensitivity_overrides: overrides } }).eq('id', tenant.id),
    )
    await audit(session, { action: 'resource.sensitivity_updated', targetType: 'resource', targetId: resourceId, targetLabel: prev?.display_name, previousState: prev, newState: { is_sensitive: isSensitive, sensitivity_category: category } })
    await rescoreTenant(tenant.id, null)
    revalidatePath(`/resources/${resourceId}`)
    revalidatePath('/resources')
    return { ok: true, message: 'Sensitivity updated and guests re-scored' }
  } catch (err) {
    return fail(err)
  }
}

export async function addAdministrator(input: { email: string; name: string; role: RoleKey }): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'admin.manage')
    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address' }
    const supabase = db()
    let { data: user } = await supabase.from('users').select('id').eq('email', email).maybeSingle()
    if (!user) {
      const { data: created } = mustWrite(
        'users insert',
        await supabase.from('users').insert({ email, display_name: input.name.trim() || email, ms_tenant_id: tenant.ms_tenant_id }).select('id').single(),
      )
      user = created
    }
    const { error } = await supabase.from('administrators').insert({ tenant_id: tenant.id, user_id: user!.id, role_key: input.role })
    if (error) return { ok: false, error: error.code === '23505' ? 'That user is already an administrator' : error.message }
    await audit(session, { action: 'admin.added', targetType: 'user', targetId: user!.id, targetLabel: email, newState: { role: input.role } })
    revalidatePath('/settings/administrators')
    return { ok: true, message: `${email} added as ${input.role.replace('_', ' ')}` }
  } catch (err) {
    return fail(err)
  }
}

export async function changeAdministratorRole(adminId: string, role: RoleKey): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'admin.manage')
    const { data: prev } = await db().from('administrators').select('role_key, user:users(email)').eq('tenant_id', tenant.id).eq('id', adminId).single()
    mustWrite(
      'administrators role',
      await db().from('administrators').update({ role_key: role }).eq('tenant_id', tenant.id).eq('id', adminId),
    )
    await audit(session, { action: 'admin.role_changed', targetType: 'administrator', targetId: adminId, targetLabel: (prev?.user as unknown as { email: string })?.email, previousState: { role: prev?.role_key }, newState: { role } })
    revalidatePath('/settings/administrators')
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function removeAdministrator(adminId: string): Promise<Result> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'admin.manage')
    const { count } = await db().from('administrators').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id).in('role_key', ['gs_admin', 'global_admin'])
    const { data: target } = await db().from('administrators').select('role_key, user:users(email)').eq('tenant_id', tenant.id).eq('id', adminId).single()
    if ((count ?? 0) <= 1 && ['gs_admin', 'global_admin'].includes(target?.role_key)) return { ok: false, error: 'Cannot remove the last administrator' }
    mustWrite(
      'administrators delete',
      await db().from('administrators').delete().eq('tenant_id', tenant.id).eq('id', adminId),
    )
    await audit(session, { action: 'admin.removed', targetType: 'administrator', targetId: adminId, targetLabel: (target?.user as unknown as { email: string })?.email })
    revalidatePath('/settings/administrators')
    return { ok: true }
  } catch (err) {
    return fail(err)
  }
}

export async function completeOnboarding(): Promise<void> {
  const { session, tenant } = await requireContext()
  mustWrite(
    'tenants onboarded',
    await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString(), onboarding_step: 5 }).eq('id', tenant.id),
  )
  await audit(session, { action: 'tenant.onboarded', targetType: 'tenant', targetId: tenant.id })
  redirect('/dashboard')
}

export async function setOnboardingStep(step: number): Promise<void> {
  const { tenant } = await requireContext()
  mustWrite('tenants onboarding_step', await db().from('tenants').update({ onboarding_step: step }).eq('id', tenant.id))
  revalidatePath('/onboarding')
}

export async function resetDemo(): Promise<void> {
  const { session, tenant } = await requireContext()
  if (!tenant.is_demo) throw new Error('Only the demo tenant can be reset')
  const newTenantId = await resetDemoTenant()
  await createSession({ ...session, tenantId: newTenantId })
  await audit({ ...session, tenantId: newTenantId }, { action: 'demo.reset', targetType: 'tenant', targetId: newTenantId })
  redirect('/dashboard')
}
