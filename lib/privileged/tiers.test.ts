import { describe, expect, it } from 'vitest'
import {
  classifyDirectoryRole,
  EXCLUDED_TEMPLATE_IDS,
  HELPDESK_ADMINISTRATOR_TEMPLATE_ID,
  TIER_0_DIRECTORY_ROLES,
  TIER_0_TEMPLATE_IDS,
  TIER_1_EXCLUDED_DIRECTORY_ROLES,
  TIER_2_FIXED_TEMPLATE_IDS,
  TIER_MAP_VERSION,
} from '@/lib/privileged/tiers'

describe('classifyDirectoryRole', () => {
  it('maps the 12 approved Tier 0 roles by template ID', () => {
    expect(Object.keys(TIER_0_TEMPLATE_IDS)).toEqual([...TIER_0_DIRECTORY_ROLES])
    expect(Object.keys(TIER_0_TEMPLATE_IDS)).toHaveLength(12)
    for (const [name, templateId] of Object.entries(TIER_0_TEMPLATE_IDS)) {
      const classified = classifyDirectoryRole({
        templateId,
        displayName: `Renamed ${name}`,
        isBuiltIn: true,
      })
      expect(classified, name).toEqual({
        privilege_tier: 0,
        tier_rule: 't0_fixed',
        is_privileged: true,
        tier_map_version: TIER_MAP_VERSION,
      })
    }
  })

  it('classifies Helpdesk Administrator as Tier 1 default_t1', () => {
    expect(
      classifyDirectoryRole({
        templateId: HELPDESK_ADMINISTRATOR_TEMPLATE_ID,
        displayName: 'Helpdesk Administrator',
        isBuiltIn: true,
      }),
    ).toEqual({
      privilege_tier: 1,
      tier_rule: 'default_t1',
      is_privileged: true,
      tier_map_version: TIER_MAP_VERSION,
    })
  })

  it('classifies Global Reader and Security Reader as Tier 2', () => {
    expect(
      classifyDirectoryRole({
        templateId: TIER_2_FIXED_TEMPLATE_IDS['Global Reader'],
        displayName: 'Global Reader',
        isBuiltIn: true,
      }).privilege_tier,
    ).toBe(2)
    expect(
      classifyDirectoryRole({
        templateId: TIER_2_FIXED_TEMPLATE_IDS['Security Reader'],
        displayName: 'Security Reader',
        isBuiltIn: true,
      }).tier_rule,
    ).toBe('t2_reader')
  })

  it('classifies other built-in names ending in Reader as Tier 2', () => {
    expect(
      classifyDirectoryRole({
        templateId: '4a5d8f65-41da-4de4-8968-e035b65339cf',
        displayName: 'Reports Reader',
        isBuiltIn: true,
      }),
    ).toMatchObject({ privilege_tier: 2, tier_rule: 't2_reader', is_privileged: true })
  })

  it('excludes Directory Readers and Guest Inviter even when Graph marks them privileged', () => {
    for (const name of TIER_1_EXCLUDED_DIRECTORY_ROLES) {
      const classified = classifyDirectoryRole({
        templateId: EXCLUDED_TEMPLATE_IDS[name],
        displayName: name,
        isBuiltIn: true,
      })
      expect(classified, name).toEqual({
        privilege_tier: null,
        tier_rule: 'excluded',
        is_privileged: false,
        tier_map_version: TIER_MAP_VERSION,
      })
    }
    expect(
      classifyDirectoryRole({
        templateId: EXCLUDED_TEMPLATE_IDS['Directory Readers'],
        displayName: 'Directory Readers',
        isBuiltIn: true,
      }).is_privileged,
    ).toBe(false)
  })

  it('treats custom roles as Tier 1 custom_default, including names ending in Reader', () => {
    expect(
      classifyDirectoryRole({
        templateId: 'cccccccc-cccc-cccc-cccc-ccccccccc901',
        displayName: 'Northwind Privileged Operators',
        isBuiltIn: false,
      }),
    ).toEqual({
      privilege_tier: 1,
      tier_rule: 'custom_default',
      is_privileged: true,
      tier_map_version: TIER_MAP_VERSION,
    })
    expect(
      classifyDirectoryRole({
        templateId: 'cccccccc-cccc-cccc-cccc-ccccccccc902',
        displayName: 'Widget Reader',
        isBuiltIn: false,
      }).tier_rule,
    ).toBe('custom_default')
  })

  it('treats unknown built-in admin roles as Tier 1 default_t1', () => {
    expect(
      classifyDirectoryRole({
        templateId: '00000000-0000-0000-0000-00000000ffff',
        displayName: 'Widget Administrator',
        isBuiltIn: true,
      }),
    ).toEqual({
      privilege_tier: 1,
      tier_rule: 'default_t1',
      is_privileged: true,
      tier_map_version: TIER_MAP_VERSION,
    })
  })

  it('never uses Graph isPrivileged to choose a tier', () => {
    const src = classifyDirectoryRole.toString()
    expect(src).not.toMatch(/isPrivileged|ms_is_privileged/)
  })
})
