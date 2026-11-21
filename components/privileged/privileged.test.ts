import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PimBanner } from '@/components/privileged/pim-banner'
import { HoldersTableStatic } from '@/components/privileged/holders-table'
import { RolesTable } from '@/components/privileged/roles-table'
import { ReadOnlySummary } from '@/components/privileged/read-only-summary'
import { RemediationPlaceholder } from '@/components/privileged/remediation-placeholder'
import { PrivilegedDashboardCard } from '@/components/privileged/dashboard-card'
import { PrivilegedOverview } from '@/components/privileged/overview'
import { privilegedFixture } from '@/lib/privileged/fixtures'
import {
  AZURE_RBAC_FILTER_PILL,
  EXCLUDED_ROLES_NOTE,
  PIM_BANNER_BODY,
  PIM_BANNER_TITLE,
  READ_ONLY_PRIVILEGED_DESCRIPTION,
  READ_ONLY_PRIVILEGED_TITLE,
  REMEDIATION_PLACEHOLDER,
  TIERS_FIXED_NOTE,
} from '@/lib/privileged/copy'
import { TIER_0_DIRECTORY_ROLES } from '@/lib/privileged/tiers'

const p2 = privilegedFixture(true)
const noP2 = privilegedFixture(false)

describe('PimBanner', () => {
  it('renders only when pim is not available', () => {
    expect(renderToStaticMarkup(createElement(PimBanner, { pim: 'available' }))).toBe('')
    const html = renderToStaticMarkup(createElement(PimBanner, { pim: 'unavailable' }))
    expect(html).toContain(PIM_BANNER_TITLE)
    expect(html).toContain(PIM_BANNER_BODY)
    expect(html).toContain('Still works')
    expect(html).toContain('Not available without P2')
    expect(html).toContain('About Entra ID P2')
  })
})

describe('HoldersTable state column', () => {
  it('shows Active when PIM is unavailable', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: noP2.holders, pimAvailable: false }))
    expect(html).toContain('Active')
    expect(html).not.toContain('PIM n/a')
    expect(html).not.toContain('Permanent')
    expect(html).toContain('Fabrikam Vendor')
    expect(html).toContain('Tier 1')
  })

  it('shows Permanent and Eligible when PIM is available', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html).toContain('Permanent')
    expect(html).toContain('Eligible')
    expect(html).toContain('Permanent + Eligible')
    expect(html).not.toContain('PIM n/a')
  })

  it('dedupes Adele Global Administrator into one Permanent + Eligible row', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html.match(/Adele Vance/g)?.length).toBe(1)
    expect(html).toContain('Permanent + Eligible')
    expect(html).not.toContain('Directory Readers')
  })

  it('does not put a tier badge next to names, and shows Owner and MFA columns', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html).toContain('MFA method')
    expect(html).toContain('Owner')
    expect(html).toContain('Showing')
    expect(html).toContain('Overdue')
    expect(html).toContain('Never')
    expect(html).toContain('Internal user')
  })
})

describe('RolesTable', () => {
  it('shows Azure RBAC Coming later as a non-clickable pill', () => {
    const html = renderToStaticMarkup(createElement(RolesTable, { roles: p2.roles, pimAvailable: true }))
    expect(html).toContain(AZURE_RBAC_FILTER_PILL)
    expect(html).not.toContain('href=')
  })

  it('excludes Directory Readers and Guest Inviter and lists all Tier 0 roles', () => {
    const html = renderToStaticMarkup(createElement(RolesTable, { roles: p2.roles, pimAvailable: true }))
    expect(html).toContain(EXCLUDED_ROLES_NOTE)
    expect(html).toContain('Tiers are fixed')
    expect(html).toContain('Helpdesk Administrator')
    expect(html).toContain('Partner Tier2 Support')
    expect(html).toContain('26 privileged roles, 25 held in this tenant')
    expect(html).toContain('Last review')
    expect(html).toContain('Never')
    expect(html).not.toMatch(/<td[^>]*>Directory Readers/)
    expect(html).not.toMatch(/<td[^>]*>Guest Inviter/)
    for (const name of TIER_0_DIRECTORY_ROLES) {
      expect(html).toContain(name)
    }
  })
})

describe('ReadOnlySummary', () => {
  it('shows totals only, with no holder names', () => {
    const html = renderToStaticMarkup(
      createElement(ReadOnlySummary, { summary: p2.summary, pim: 'available', tenantName: 'Northwind Health' }),
    )
    expect(html).toContain(READ_ONLY_PRIVILEGED_TITLE)
    expect(html).toContain(READ_ONLY_PRIVILEGED_DESCRIPTION)
    expect(html).toContain('Privileged reviews')
    expect(html).not.toContain('Adele Vance')
    expect(html).not.toContain('Export CSV')
    expect(html).not.toContain('Start privileged review')
    expect(html).not.toContain('tab=holders')
  })
})

describe('RemediationPlaceholder', () => {
  it('keeps the tab as a placeholder', () => {
    const html = renderToStaticMarkup(createElement(RemediationPlaceholder))
    expect(html).toContain(REMEDIATION_PLACEHOLDER)
  })
})

describe('PrivilegedDashboardCard', () => {
  it('renders privileged totals matching the dashboard mock', () => {
    const html = renderToStaticMarkup(createElement(PrivilegedDashboardCard, { summary: p2.summary }))
    expect(html).toContain('Privileged access')
    expect(html).toContain('Open privileged access')
    expect(html).toContain('tenant-wide control')
    expect(html).toContain('other admin roles')
    expect(html).toContain('read-only admin roles')
    expect(html).toContain('no sign-in 90d+')
    expect(html).toContain('98')
    expect(html).toContain('142')
  })
})

describe('PrivilegedOverview', () => {
  it('counts standing by assignments and hides standing T0 when there is no P2', () => {
    const p2Html = renderToStaticMarkup(createElement(PrivilegedOverview, { summary: p2.summary, highestRisk: p2.highestRisk }))
    expect(p2Html).toContain('Permanent assignments 64 / of 142, PIM available')
    expect(p2Html).toContain('4 overdue, 6 never reviewed')
    expect(p2Html).toContain('Next due')
    expect(p2Html).toContain('Highest-risk role holders')
    expect(p2Html).toContain('Tenant findings')

    const noP2Html = renderToStaticMarkup(createElement(PrivilegedOverview, { summary: noP2.summary }))
    expect(noP2Html).toContain('all 74 shown as active')
    expect(noP2Html).not.toContain('Standing Tier 0 assignment')
  })
})
