import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PimBanner } from '@/components/privileged/pim-banner'
import { HoldersTableStatic } from '@/components/privileged/holders-table'
import { RolesTable } from '@/components/privileged/roles-table'
import { ReadOnlySummary } from '@/components/privileged/read-only-summary'
import { RemediationPlaceholder } from '@/components/privileged/remediation-placeholder'
import { PrivilegedDashboardCard } from '@/components/privileged/dashboard-card'
import { privilegedFixture } from '@/lib/privileged/fixtures'
import { AZURE_RBAC_COMING_LATER, READ_ONLY_PRIVILEGED_DESCRIPTION, REMEDIATION_PLACEHOLDER } from '@/lib/privileged/copy'

const p2 = privilegedFixture(true)
const noP2 = privilegedFixture(false)

describe('PimBanner', () => {
  it('renders only when pim is not available', () => {
    expect(renderToStaticMarkup(createElement(PimBanner, { pim: 'available' }))).toBe('')
    const html = renderToStaticMarkup(createElement(PimBanner, { pim: 'unavailable' }))
    expect(html).toContain('Needs P2')
    expect(html).toContain('Privileged Identity Management')
  })
})

describe('HoldersTable state column', () => {
  it('shows PIM n/a when PIM is unavailable', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: noP2.holders, pimAvailable: false }))
    expect(html).toContain('PIM n/a')
    expect(html).not.toContain('Permanent')
    expect(html).toContain('Fabrikam Vendor')
    expect(html).toContain('Tier 1')
  })

  it('shows Permanent and Eligible when PIM is available', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html).toContain('Permanent')
    expect(html).toContain('Eligible')
    expect(html).not.toContain('PIM n/a')
  })
})

describe('RolesTable', () => {
  it('shows Azure RBAC Coming later', () => {
    const html = renderToStaticMarkup(createElement(RolesTable, { roles: p2.roles, pimAvailable: true }))
    expect(html).toContain('Azure RBAC')
    expect(html).toContain(AZURE_RBAC_COMING_LATER)
  })
})

describe('ReadOnlySummary', () => {
  it('shows totals only, with no holder names', () => {
    const html = renderToStaticMarkup(
      createElement(ReadOnlySummary, { summary: p2.summary, pim: 'available', tenantName: 'Northwind Health' }),
    )
    expect(html).toContain(READ_ONLY_PRIVILEGED_DESCRIPTION)
    expect(html).toContain('Privileged identities')
    expect(html).not.toContain('Adele Admin')
    expect(html).not.toContain('Export')
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
  it('renders privileged totals', () => {
    const html = renderToStaticMarkup(createElement(PrivilegedDashboardCard, { summary: p2.summary }))
    expect(html).toContain('Privileged access')
    expect(html).toContain('64')
  })
})
