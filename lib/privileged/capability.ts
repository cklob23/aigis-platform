import {
  DEFAULT_PRIVILEGED_SETTINGS,
  type PrivilegedCapability,
  type PrivilegedLicenseHint,
  type PrivilegedPimStatus,
  type PrivilegedSettings,
} from '@/lib/types'
import { PRIVILEGED_READ_PERMISSIONS } from '@/lib/graph/permissions'

export type PrivilegedProbe = { status: number }

export type PrivilegedDeps = {
  getRoles: (msTenantId: string, fresh: boolean) => Promise<string[]>
  listSkus: () => Promise<{ skuPartNumber?: string }[]>
  probeDirectoryPim: () => Promise<PrivilegedProbe>
  findRoleAssignableGroupId: () => Promise<string | null>
  probeGroupPim: (groupId: string) => Promise<PrivilegedProbe>
  probeSignInActivity: () => Promise<boolean>
  now?: () => Date
}

const ROLE_MANAGEMENT = 'RoleManagement.Read.Directory'
const GROUP_ELIGIBILITY = 'PrivilegedEligibilitySchedule.Read.AzureADGroup'
const AUTH_METHODS = 'UserAuthenticationMethod.Read.All'

/** Only a strict boolean true turns the module on. The string "true" stays off. */
export function parsePrivilegedSettings(settings: Record<string, unknown> | null | undefined): PrivilegedSettings {
  const raw = (settings?.privileged ?? null) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PRIVILEGED_SETTINGS }
  return {
    enabled: raw.enabled === true,
    capability: parseCapability(raw.capability),
    granted_permissions: parseGrantedPermissions(raw.granted_permissions),
  }
}

export function mergePrivilegedSettings(
  settings: Record<string, unknown>,
  next: { enabled: boolean; capability: PrivilegedCapability | null; granted_permissions?: string[] },
): Record<string, unknown> {
  const prev = parsePrivilegedSettings(settings)
  return {
    ...settings,
    privileged: {
      enabled: next.enabled,
      capability: next.capability,
      granted_permissions: next.granted_permissions ?? prev.granted_permissions,
    },
  }
}

function parseGrantedPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

/** Live privileged scan stage. Strict enabled flag, and skip when directory PIM still needs consent. */
export function privilegedStageEnabled(settings: Record<string, unknown> | null | undefined): boolean {
  const parsed = parsePrivilegedSettings(settings)
  return parsed.enabled === true && parsed.capability?.pim !== 'needs_consent'
}

/** Recheck probes Graph. Off and demo tenants must not. */
export function shouldProbePrivilegedCapability(enabled: boolean, isDemo: boolean): boolean {
  return enabled === true && !isDemo
}

function parseCapability(value: unknown): PrivilegedCapability | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const pim = asPimStatus(raw.pim)
  const pim_groups = asPimStatus(raw.pim_groups)
  if (!pim || !pim_groups) return null
  const license_hint = asLicenseHint(raw.license_hint)
  if (!license_hint) return null
  return {
    pim,
    pim_groups,
    sign_in_activity: raw.sign_in_activity === true,
    auth_methods: raw.auth_methods === true,
    license_hint,
    checked_at: typeof raw.checked_at === 'string' ? raw.checked_at : new Date(0).toISOString(),
    scan_job_id: typeof raw.scan_job_id === 'string' ? raw.scan_job_id : null,
  }
}

function asPimStatus(value: unknown): PrivilegedPimStatus | null {
  if (value === 'available' || value === 'unavailable' || value === 'needs_consent' || value === 'unknown') return value
  return null
}

function asLicenseHint(value: unknown): PrivilegedLicenseHint | null {
  if (value === 'p2' || value === 'p1' || value === 'governance' || value === 'none') return value
  return null
}

export function licenseHintFromSkus(skus: { skuPartNumber?: string }[]): PrivilegedLicenseHint {
  const parts = skus.map((s) => s.skuPartNumber ?? '')
  if (parts.some((p) => p === 'AAD_PREMIUM_P2')) return 'p2'
  if (parts.some((p) => /GOVERNANCE/i.test(p) || /ENTRA_ID_GOVERNANCE/i.test(p))) return 'governance'
  if (parts.some((p) => p === 'AAD_PREMIUM')) return 'p1'
  return 'none'
}

/**
 * Directory PIM status. 200 is available. 4xx with the permission present is
 * unavailable, unless the SKU hint is P2 and the probe failed, which is unknown.
 */
export function pimStatusFromProbe(input: {
  hasRoleManagement: boolean
  probeStatus: number | null
  licenseHint: PrivilegedLicenseHint
}): PrivilegedPimStatus {
  if (!input.hasRoleManagement) return 'needs_consent'
  if (input.probeStatus === 200) return 'available'
  if (input.licenseHint === 'p2') return 'unknown'
  if (input.probeStatus != null && input.probeStatus >= 400 && input.probeStatus < 500) return 'unavailable'
  return 'unknown'
}

export function capabilityFingerprint(cap: PrivilegedCapability | null): string {
  if (!cap) return ''
  return [cap.pim, cap.pim_groups, cap.sign_in_activity ? '1' : '0', cap.auth_methods ? '1' : '0', cap.license_hint].join('|')
}

export function grantedPrivilegedPermissions(roles: string[]): { name: string; granted: boolean }[] {
  return PRIVILEGED_READ_PERMISSIONS.map((name) => ({ name, granted: roles.includes(name) }))
}

export async function detectPrivilegedCapability(
  tenant: { ms_tenant_id: string },
  deps: PrivilegedDeps,
  scanJobId: string | null = null,
): Promise<PrivilegedCapability> {
  const checked_at = (deps.now ?? (() => new Date()))().toISOString()
  const empty = (over: Partial<PrivilegedCapability>): PrivilegedCapability => ({
    pim: 'unknown',
    pim_groups: 'unknown',
    sign_in_activity: false,
    auth_methods: false,
    license_hint: 'none',
    checked_at,
    scan_job_id: scanJobId,
    ...over,
  })

  let roles: string[] = []
  try {
    roles = await deps.getRoles(tenant.ms_tenant_id, true)
  } catch {
    return empty({ pim: 'unknown', pim_groups: 'unknown' })
  }

  const auth_methods = roles.includes(AUTH_METHODS)
  const hasRoleManagement = roles.includes(ROLE_MANAGEMENT)
  const hasGroupEligibility = roles.includes(GROUP_ELIGIBILITY)

  if (!hasRoleManagement) {
    return empty({
      pim: 'needs_consent',
      pim_groups: hasGroupEligibility ? 'unknown' : 'needs_consent',
      auth_methods,
    })
  }

  let license_hint: PrivilegedLicenseHint = 'none'
  try {
    license_hint = licenseHintFromSkus(await deps.listSkus())
  } catch {
    license_hint = 'none'
  }

  let probeStatus: number | null = null
  try {
    probeStatus = (await deps.probeDirectoryPim()).status
  } catch {
    probeStatus = null
  }
  const pim = pimStatusFromProbe({ hasRoleManagement: true, probeStatus, licenseHint: license_hint })

  let pim_groups: PrivilegedPimStatus = 'unknown'
  if (!hasGroupEligibility) {
    pim_groups = 'needs_consent'
  } else {
    try {
      const groupId = await deps.findRoleAssignableGroupId()
      if (!groupId) {
        pim_groups = 'unknown'
      } else {
        const groupProbe = await deps.probeGroupPim(groupId)
        if (groupProbe.status === 200) pim_groups = 'available'
        else if (groupProbe.status >= 400 && groupProbe.status < 500) pim_groups = 'unavailable'
        else pim_groups = 'unknown'
      }
    } catch {
      pim_groups = 'unknown'
    }
  }

  let sign_in_activity = false
  try {
    sign_in_activity = await deps.probeSignInActivity()
  } catch {
    sign_in_activity = false
  }

  return { pim, pim_groups, sign_in_activity, auth_methods, license_hint, checked_at, scan_job_id: scanJobId }
}
