import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PRIVILEGED_SETTINGS } from '@/lib/types'
import { formatCheckedAt } from '@/lib/format'
import { GRAPH_APPLICATION_READ_PERMISSIONS, PRIVILEGED_READ_PERMISSIONS } from '@/lib/graph/permissions'
import {
  detectPrivilegedCapability,
  licenseHintFromSkus,
  parsePrivilegedSettings,
  pimStatusFromProbe,
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
})
