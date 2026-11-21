import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRIVILEGED_SETTINGS } from '@/lib/types'
import { formatCheckedAt } from '@/lib/format'
import { GRAPH_APPLICATION_READ_PERMISSIONS, PRIVILEGED_READ_PERMISSIONS } from '@/lib/graph/permissions'
import {
  detectPrivilegedCapability,
  groupPimReadsEnabled,
  licenseHintFromSkus,
  parsePrivilegedSettings,
  authMethodsReadsEnabled,
  pimDirectoryReadsEnabled,
  pimStatusFromProbe,
  privilegedAlertsEnabled,
  privilegedPagesEnabled,
  privilegedStageEnabled,
  shouldProbePrivilegedCapability,
  type PrivilegedDeps,
} from '@/lib/privileged/capability'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tenant = { ms_tenant_id: '11111111-1111-1111-1111-111111111111' }
const now = () => new Date('2026-11-19T12:00:00.000Z')

function deps(over: Partial<PrivilegedDeps> = {}): PrivilegedDeps {
  return {
    getRoles: async () => [
      'RoleManagement.Read.Directory',
      'PrivilegedEligibilitySchedule.Read.AzureADGroup',
      'UserAuthenticationMethod.Read.All',
    ],
    listSkus: async () => [{ skuPartNumber: 'AAD_PREMIUM_P2' }],
    probeDirectoryPim: async () => ({ status: 200 }),
    findRoleAssignableGroupId: async () => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    probeGroupPim: async () => ({ status: 200 }),
    probeSignInActivity: async () => true,
    now,
    ...over,
  }
}

describe('parsePrivilegedSettings', () => {
  it('treats missing, the string true, and false as off, and only boolean true as on', () => {
    expect(parsePrivilegedSettings(undefined)).toEqual(DEFAULT_PRIVILEGED_SETTINGS)
    expect(parsePrivilegedSettings({})).toEqual(DEFAULT_PRIVILEGED_SETTINGS)
    expect(parsePrivilegedSettings({ privileged: { enabled: 'true' } }).enabled).toBe(false)
    expect(parsePrivilegedSettings({ privileged: { enabled: false } }).enabled).toBe(false)
    expect(parsePrivilegedSettings({ privileged: { enabled: true } }).enabled).toBe(true)
    expect(parsePrivilegedSettings({ privileged: { enabled: true } }).granted_permissions).toEqual([])
  })
})

describe('privilegedStageEnabled', () => {
  it('is on only when enabled is true and pim is not needs_consent', () => {
    expect(privilegedStageEnabled({ privileged: { enabled: true, capability: { pim: 'available', pim_groups: 'available', sign_in_activity: true, auth_methods: true, license_hint: 'p2', checked_at: '2026-11-19T12:00:00.000Z', scan_job_id: null } } })).toBe(true)
    expect(privilegedStageEnabled({ privileged: { enabled: true, capability: { pim: 'unavailable', pim_groups: 'unknown', sign_in_activity: false, auth_methods: false, license_hint: 'none', checked_at: '2026-11-19T12:00:00.000Z', scan_job_id: null } } })).toBe(true)
    expect(privilegedStageEnabled({ privileged: { enabled: true, capability: { pim: 'needs_consent', pim_groups: 'needs_consent', sign_in_activity: false, auth_methods: false, license_hint: 'none', checked_at: '2026-11-19T12:00:00.000Z', scan_job_id: null } } })).toBe(false)
    expect(privilegedStageEnabled({ privileged: { enabled: false, capability: { pim: 'available', pim_groups: 'available', sign_in_activity: true, auth_methods: true, license_hint: 'p2', checked_at: '2026-11-19T12:00:00.000Z', scan_job_id: null } } })).toBe(false)
    expect(privilegedStageEnabled({})).toBe(false)
  })

  it('treats a missing or null capability as not ready even when enabled is true', () => {
    expect(privilegedStageEnabled({ privileged: { enabled: true } })).toBe(false)
    expect(privilegedStageEnabled({ privileged: { enabled: true, capability: null } })).toBe(false)
    expect(privilegedStageEnabled({ privileged: { enabled: true, capability: { pim: 'available' } } })).toBe(false)
  })
})

describe('privilegedPagesEnabled vs privilegedAlertsEnabled', () => {
  it('turns pages on from the enabled flag alone, and keeps alerts on the stage check', () => {
    const consent = {
      privileged: {
        enabled: true,
        capability: {
          pim: 'needs_consent',
          pim_groups: 'needs_consent',
          sign_in_activity: false,
          auth_methods: false,
          license_hint: 'none',
          checked_at: '2026-11-19T12:00:00.000Z',
          scan_job_id: null,
        },
      },
    }
    expect(privilegedPagesEnabled(consent)).toBe(true)
    expect(privilegedAlertsEnabled(consent)).toBe(false)
    expect(privilegedAlertsEnabled(consent)).toBe(privilegedStageEnabled(consent))
    expect(privilegedPagesEnabled({ privileged: { enabled: false } })).toBe(false)
  })
})

const fullCapability = {
  pim: 'available',
  pim_groups: 'available',
  sign_in_activity: true,
  auth_methods: true,
  license_hint: 'p2',
  checked_at: '2026-11-19T12:00:00.000Z',
  scan_job_id: null,
} as const

describe('pimDirectoryReadsEnabled / groupPimReadsEnabled', () => {
  it('requires the privileged stage plus pim === available', () => {
    expect(pimDirectoryReadsEnabled({ privileged: { enabled: true, capability: fullCapability } })).toBe(true)
    expect(
      pimDirectoryReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, pim: 'unavailable' } },
      }),
    ).toBe(false)
    expect(
      pimDirectoryReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, pim: 'needs_consent' } },
      }),
    ).toBe(false)
    expect(
      pimDirectoryReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, pim: 'unknown' } },
      }),
    ).toBe(false)
    expect(pimDirectoryReadsEnabled({ privileged: { enabled: true } })).toBe(false)
    expect(pimDirectoryReadsEnabled({ privileged: { enabled: false, capability: fullCapability } })).toBe(false)
  })

  it('requires the privileged stage plus pim_groups === available', () => {
    expect(groupPimReadsEnabled({ privileged: { enabled: true, capability: fullCapability } })).toBe(true)
    expect(
      groupPimReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, pim_groups: 'unavailable' } },
      }),
    ).toBe(false)
    expect(
      groupPimReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, pim_groups: 'needs_consent' } },
      }),
    ).toBe(false)
    expect(
      groupPimReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, pim: 'needs_consent' } },
      }),
    ).toBe(false)
    expect(groupPimReadsEnabled({ privileged: { enabled: true } })).toBe(false)
  })

  it('gates auth-method $batch GETs on the privileged stage plus auth_methods', () => {
    expect(authMethodsReadsEnabled({ privileged: { enabled: true, capability: fullCapability } })).toBe(true)
    expect(
      authMethodsReadsEnabled({
        privileged: { enabled: true, capability: { ...fullCapability, auth_methods: false } },
      }),
    ).toBe(false)
    expect(authMethodsReadsEnabled({ privileged: { enabled: false, capability: fullCapability } })).toBe(false)
  })
})

describe('shouldProbePrivilegedCapability', () => {
  it('is false for demo tenants and when the flag is off', () => {
    expect(shouldProbePrivilegedCapability(true, false)).toBe(true)
    expect(shouldProbePrivilegedCapability(false, false)).toBe(false)
    expect(shouldProbePrivilegedCapability(true, true)).toBe(false)
    expect(shouldProbePrivilegedCapability(false, true)).toBe(false)
  })
})

describe('licenseHintFromSkus', () => {
  it('maps P2, P1, governance, and none', () => {
    expect(licenseHintFromSkus([{ skuPartNumber: 'AAD_PREMIUM_P2' }])).toBe('p2')
    expect(licenseHintFromSkus([{ skuPartNumber: 'AAD_PREMIUM' }])).toBe('p1')
    expect(licenseHintFromSkus([{ skuPartNumber: 'AAD_PREMIUM_P2' }, { skuPartNumber: 'AAD_PREMIUM' }])).toBe('p2')
    expect(licenseHintFromSkus([{ skuPartNumber: 'ENTERPRISEPACK' }, { skuPartNumber: 'GUID_ENTRA_ID_GOVERNANCE' }])).toBe(
      'governance',
    )
    expect(licenseHintFromSkus([{ skuPartNumber: 'ENTERPRISEPACK' }])).toBe('none')
  })

  it('does not treat AAD_PREMIUM_P2 as P1', () => {
    expect(licenseHintFromSkus([{ skuPartNumber: 'AAD_PREMIUM_P2' }])).not.toBe('p1')
  })
})

describe('pimStatusFromProbe', () => {
  it('maps 200 to available, 4xx with permission to unavailable, missing permission to needs_consent, and P2-plus-fail to unknown', () => {
    expect(pimStatusFromProbe({ hasRoleManagement: true, probeStatus: 200, licenseHint: 'none' })).toBe('available')
    expect(pimStatusFromProbe({ hasRoleManagement: true, probeStatus: 403, licenseHint: 'p1' })).toBe('unavailable')
    expect(pimStatusFromProbe({ hasRoleManagement: true, probeStatus: 400, licenseHint: 'none' })).toBe('unavailable')
    expect(pimStatusFromProbe({ hasRoleManagement: false, probeStatus: null, licenseHint: 'none' })).toBe('needs_consent')
    expect(pimStatusFromProbe({ hasRoleManagement: true, probeStatus: 403, licenseHint: 'p2' })).toBe('unknown')
    expect(pimStatusFromProbe({ hasRoleManagement: true, probeStatus: null, licenseHint: 'p2' })).toBe('unknown')
  })
})

describe('detectPrivilegedCapability', () => {
  it('treats a 200 directory probe as available', async () => {
    const cap = await detectPrivilegedCapability(tenant, deps())
    expect(cap.pim).toBe('available')
    expect(cap.pim_groups).toBe('available')
    expect(cap.license_hint).toBe('p2')
    expect(cap.sign_in_activity).toBe(true)
    expect(cap.auth_methods).toBe(true)
    expect(cap.checked_at).toBe('2026-11-19T12:00:00.000Z')
  })

  it('treats a 4xx directory probe with the permission present as unavailable', async () => {
    const cap = await detectPrivilegedCapability(
      tenant,
      deps({
        listSkus: async () => [{ skuPartNumber: 'AAD_PREMIUM' }],
        probeDirectoryPim: async () => ({ status: 403 }),
      }),
    )
    expect(cap.pim).toBe('unavailable')
    expect(cap.license_hint).toBe('p1')
  })

  it('returns needs_consent and stops Graph probes when RoleManagement.Read.Directory is missing', async () => {
    const listSkus = vi.fn(async () => [{ skuPartNumber: 'AAD_PREMIUM_P2' }])
    const probeDirectoryPim = vi.fn(async () => ({ status: 200 }))
    const cap = await detectPrivilegedCapability(
      tenant,
      deps({
        getRoles: async () => ['User.Read.All'],
        listSkus,
        probeDirectoryPim,
      }),
    )
    expect(cap.pim).toBe('needs_consent')
    expect(cap.pim_groups).toBe('needs_consent')
    expect(cap.auth_methods).toBe(false)
    expect(listSkus).not.toHaveBeenCalled()
    expect(probeDirectoryPim).not.toHaveBeenCalled()
  })

  it('returns unknown when SKUs say P2 but the directory probe fails', async () => {
    const cap = await detectPrivilegedCapability(
      tenant,
      deps({
        probeDirectoryPim: async () => ({ status: 400 }),
      }),
    )
    expect(cap.pim).toBe('unknown')
    expect(cap.license_hint).toBe('p2')
  })

  it('returns unknown for group PIM when no role-assignable group exists', async () => {
    const cap = await detectPrivilegedCapability(tenant, deps({ findRoleAssignableGroupId: async () => null }))
    expect(cap.pim_groups).toBe('unknown')
  })
})

describe('privileged permission lists', () => {
  it('never includes ReadWrite permissions', () => {
    for (const name of [...GRAPH_APPLICATION_READ_PERMISSIONS, ...PRIVILEGED_READ_PERMISSIONS]) {
      expect(name).not.toMatch(/ReadWrite/)
    }
  })

  it('lists the four privileged reads on onboarding and scans', () => {
    const onboarding = readFileSync(path.join(root, 'components/onboarding/permission-list.tsx'), 'utf8')
    const scans = readFileSync(path.join(root, 'app/(app)/scans/page.tsx'), 'utf8')
    expect(onboarding).toContain('PRIVILEGED_READ_PERMISSIONS')
    expect(onboarding).toContain('Used by the Privileged access module')
    expect(onboarding).toContain('All permissions are read-only. AIGIS never changes your tenant.')
    expect(onboarding).not.toContain('Mail.Send')
    expect(scans).toContain('GRAPH_APPLICATION_READ_PERMISSIONS')
    for (const name of PRIVILEGED_READ_PERMISSIONS) {
      expect(GRAPH_APPLICATION_READ_PERMISSIONS).toContain(name)
    }
  })
})

describe('formatCheckedAt', () => {
  it('shows a relative label and a local-zone hover title', () => {
    const now = new Date('2026-11-19T12:02:00.000Z')
    const out = formatCheckedAt('2026-11-19T12:00:00.000Z', now)
    expect(out.label).toBe('2 min ago')
    expect(out.title).toContain('Nov 19, 2026')
    expect(out.title).not.toBe(out.label)
  })
})

describe('privileged module isolation', () => {
  it('keeps capability detection free of Graph client and write helpers', () => {
    const src = readFileSync(path.join(root, 'lib/privileged/capability.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]@\/lib\/graph\/client/)
    expect(src).not.toMatch(/from ['"]@\/lib\/graph\/queries/)
    expect(src).not.toMatch(/\b(post|patch|delete)\s*\(/i)
  })

  it('does not call getAppOnlyRoles on every settings load', () => {
    const src = readFileSync(path.join(root, 'app/(app)/settings/page.tsx'), 'utf8')
    expect(src).toMatch(/consent === 'granted'/)
    expect(src).toMatch(/granted_permissions/)
    expect(src).not.toMatch(/getAppOnlyRoles\(tenant\.ms_tenant_id, consent === 'granted'\)/)
  })

  it('flag-gates recheckPrivilegedCapability on the server', () => {
    const src = readFileSync(path.join(root, 'lib/actions/settings.ts'), 'utf8')
    expect(src).toMatch(/shouldProbePrivilegedCapability\(prev\.enabled, tenant\.is_demo\)/)
  })

  it('keeps the default scan phase list free of privileged and gates the stage in the engine', () => {
    const src = readFileSync(path.join(root, 'lib/scan/engine.ts'), 'utf8')
    expect(src).toMatch(/const PHASES: Phase\[\] = \['organization', 'guests', 'groups'/)
    expect(src).not.toMatch(/const PHASES: Phase\[\] = \[[^\]]*privileged/)
    expect(src).toMatch(/privilegedStageEnabled/)
    expect(src).toMatch(/runPrivilegedStage/)
    expect(src).toMatch(/Inventorying internal users/)
  })

  it('keeps privileged Graph helpers GET-only', () => {
    const src = readFileSync(path.join(root, 'lib/graph/privileged.ts'), 'utf8')
    expect(src).toMatch(/g\.getAll/)
    expect(src).toMatch(/roleManagement\/directory\/roleEligibilitySchedules/)
    expect(src).toMatch(/identityGovernance\/privilegedAccess\/group\/eligibilitySchedules/)
    expect(src).not.toMatch(/\b(post|patch|delete)\s*\(/i)
    expect(src).not.toMatch(/roleManagement\/directory\/roleDefinitions.*\$filter/)
    expect(src).not.toMatch(/roleAssignmentScheduleRequests/)
    expect(src).not.toMatch(/eligibilityScheduleRequests/)
    const auth = readFileSync(path.join(root, 'lib/risk/auth-methods.ts'), 'utf8')
    expect(auth).toMatch(/method: 'GET'/)
    expect(auth).not.toMatch(/PATCH|DELETE/)
    const stage = readFileSync(path.join(root, 'lib/scan/privileged.ts'), 'utf8')
    expect(stage).toMatch(/g\.batch/)
    expect(stage).not.toMatch(/g\.(post|patch|delete)\(/)
  })

  it('inventories roles only from the flag-gated privileged stage', () => {
    const engine = readFileSync(path.join(root, 'lib/scan/engine.ts'), 'utf8')
    const stage = readFileSync(path.join(root, 'lib/scan/privileged.ts'), 'utf8')
    expect(engine).toMatch(/if \(privilegedOn\)/)
    expect(engine).toMatch(/runPrivilegedStage\(jobId, tenantId, g, tenant\.settings/)
    expect(stage).toMatch(/planPrivilegedInventory/)
    expect(stage).toMatch(/privileged\.inventory_synced/)
    expect(stage).toMatch(/pimDirectoryReadsEnabled/)
    expect(stage).toMatch(/groupPimReadsEnabled/)
    expect(stage).toMatch(/authMethodsReadsEnabled/)
    expect(stage).toMatch(/persistRoleHolderAuthMethods/)
    expect(stage).toMatch(/AUTH_METHOD_BATCH_SIZE/)
    expect(stage).toMatch(/fetchRoleEligibilitySchedules/)
    expect(stage).toMatch(/fetchGroupEligibilitySchedules/)
    expect(stage).toMatch(/pimOn \? await fetchRoleEligibilitySchedules/)
    expect(stage).toMatch(/groupPimOn \? await fetchGroupEligibilitySchedules/)
    expect(engine).not.toMatch(/planPrivilegedInventory/)
  })
})
