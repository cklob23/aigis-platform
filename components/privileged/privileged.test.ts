import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/actions/ai', () => ({
  explainGuestRecommendation: vi.fn(),
  explainIdentityRecommendation: vi.fn(),
}))

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
import { PimBanner } from '@/components/privileged/pim-banner'
import { HoldersTableStatic } from '@/components/privileged/holders-table'
import { RolesTable } from '@/components/privileged/roles-table'
import { ReadOnlySummary } from '@/components/privileged/read-only-summary'
import { RemediationPlaceholder } from '@/components/privileged/remediation-placeholder'
import { PrivilegedDashboardCard } from '@/components/privileged/dashboard-card'
import { PrivilegedOverview } from '@/components/privileged/overview'
import { privilegedDemoAdeleProfile, privilegedFixture, privilegedProfileFixture } from '@/lib/privileged/fixtures'
import { IdentityProfile } from '@/components/privileged/identity-profile'
import { PrivilegedDetailDenied } from '@/components/privileged/detail-denied'
import { EXPLAIN_GENERATED_CAPTION, OPEN_ROLE_DEFINITION, PIM_ACTIVATION_WINDOW, OPEN_IN_ENTRA, PRIVILEGED_DETAIL_DENIED, PRIVILEGED_REVIEW_SUMMARY } from '@/lib/privileged/copy'
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

  it('keeps Check again when a recheck control is passed', () => {
    const html = renderToStaticMarkup(
      createElement(PimBanner, { pim: 'unavailable', recheck: createElement('button', null, 'Check again') }),
    )
    expect(html).toContain('Check again')
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
    expect(html).not.toContain('PIM n/a')
  })

  it('shows Adele Vance once per remaining role, without a duplicate Global Administrator', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html.match(/Adele Vance/g)?.length).toBe(2)
    expect(html).not.toContain('Permanent + Eligible')
    expect(html).toContain('Global Administrator')
    expect(html).toContain('Helpdesk Administrator')
    expect(html).not.toContain('Directory Readers')
  })

  it('does not put a tier badge next to names, and shows Owner and MFA columns', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html).toContain('>MFA<')
    expect(html).toContain('Owner')
    expect(html).toContain('Showing')
    expect(html).toContain('Review overdue')
    expect(html).toContain('Never reviewed')
    expect(html).toContain('Internal user')
    expect(html).toContain('External user')
    expect(html).not.toContain('>Guest<')
    expect(html).toContain('app id 7f3c…b21e')
    expect(html).not.toContain('hr-sync@northwind.example')
    expect(html.indexOf('>Identity<')).toBeLessThan(html.indexOf('>Class<'))
    expect(html.indexOf('>Class<')).toBeLessThan(html.indexOf('>Tier<'))
    expect(html.indexOf('>Tier<')).toBeLessThan(html.indexOf('>Roles<'))
    expect(html.indexOf('>Roles<')).toBeLessThan(html.indexOf('>Assignment<'))
    expect(html.indexOf('>Assignment<')).toBeLessThan(html.indexOf('>Last activity<'))
    expect(html.indexOf('>Last activity<')).toBeLessThan(html.indexOf('>MFA<'))
    expect(html.indexOf('>MFA<')).toBeLessThan(html.indexOf('>Owner<'))
    expect(html.indexOf('>Owner<')).toBeLessThan(html.indexOf('>Risk<'))
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
    expect(html).toContain('Holders 1')
    expect(html).toContain('Permanent 1')
    expect(html).toContain('Eligible 2')
    expect(html).toContain('Jul 1, 2026')
    expect(html).toContain('Overdue')
    expect(html).toContain('Can manage all of Microsoft Entra ID')
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
    expect(html).toContain('Mark change made')
    expect(html).toContain('AIGIS confirms it on the next scan')
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
    expect(p2Html).toContain('of 142, PIM available')
    expect(p2Html).not.toContain('Permanent assignments 64 / of 142')
    expect(p2Html).toContain('4 overdue, 6 never reviewed')
    expect(p2Html).toContain('Next due')
    expect(p2Html).toContain('Dec 11, 2026')
    expect(p2Html).not.toContain('Nov 18, 2026 · overdue')
    expect(p2Html).not.toContain('Dec 11, 2026 · overdue')
    expect(p2Html).toContain('Preview')
    expect(p2Html).toContain('Highest-risk role holders')
    expect(p2Html).toContain('Tenant findings')
    expect(p2Html).toContain('Permanent Tier 0 assignment')
    expect(p2Html).toContain('External identities')
    expect(p2Html).not.toContain('>Guests<')
    expect(p2Html.match(/Standing vs just-in-time/g)?.length).toBe(1)

    const noP2Html = renderToStaticMarkup(createElement(PrivilegedOverview, { summary: noP2.summary }))
    expect(noP2Html).toContain('all 74 shown as active')
    expect(noP2Html.match(/all 74 shown as active/g)?.length).toBe(1)
    expect(noP2Html).not.toContain('Permanent Tier 0 assignment')
    expect(noP2Html).not.toContain('Standing Tier 0 assignment')
  })
})

describe('High risk badge contrast', () => {
  it('uses #92400E on the light High badge', () => {
    const src = readFileSync(path.join(root, 'components/risk/risk-badge.tsx'), 'utf8')
    expect(src).toContain("high: 'bg-[#FFEDD5] text-[#92400E]")
    expect(src).not.toContain('text-[#B45309]')
    expect(src).not.toContain('text-[#9A3412]')
    expect(src).not.toContain('opacity-80')
    expect(src).toContain('text-[#991B1B]')
  })
})

describe('placeholder copy', () => {
  it('does not offer Start privileged review yet', () => {
    const src = readFileSync(path.join(root, 'components/privileged/privileged-page.tsx'), 'utf8')
    expect(src).not.toContain('Start privileged review')
  })

  it('turns the identity route into a real profile', () => {
    const src = readFileSync(path.join(root, 'app/(app)/privileged/[id]/page.tsx'), 'utf8')
    expect(src).toContain('IdentityProfile')
    expect(src).toContain('getPrivilegedIdentity')
    expect(src).toContain('PrivilegedDetailDenied')
    expect(src).toMatch(/if \(!profile\) notFound\(\)/)
    expect(src).toContain('isDemo: session.demo')
    expect(src).not.toContain('isDemo: tenant.is_demo')
  })

  it('counts Global Administrators without loading every assignment onto a profile', () => {
    const src = readFileSync(path.join(root, 'lib/data/privileged.ts'), 'utf8')
    expect(src).toContain('countGlobalAdminPrincipals')
    expect(src).toContain(".eq('principal_identity_id', identityId)")
    expect(src).toContain(".eq('template_id', GLOBAL_ADMIN_TEMPLATE_ID)")
  })
})

describe('IdentityProfile', () => {
  it('uses a neutral Explain icon', () => {
    const src = readFileSync(path.join(root, 'components/guests/explain-recommendation.tsx'), 'utf8')
    expect(src).toContain('FileText')
    expect(src).not.toContain('Sparkles')
    expect(src).not.toContain('text-destructive')
  })

  it('stacks PIM history below sm', () => {
    const src = readFileSync(path.join(root, 'components/privileged/activation-history.tsx'), 'utf8')
    expect(src).toContain('hidden sm:block')
    expect(src).toContain('sm:hidden')
  })

  it('renders mock 04 fields for a P2 identity', () => {
    const html = renderToStaticMarkup(
      createElement(IdentityProfile, {
        profile: privilegedProfileFixture(true),
        aiEnabled: true,
      }),
    )
    expect(html).toContain('Lee Gu')
    expect(html).toContain(OPEN_IN_ENTRA)
    expect(html).toContain(PIM_ACTIVATION_WINDOW)
    expect(html).toContain('Privileged Role Administrator')
    expect(html).not.toContain('Standing (permanent) Tier 0 assignment')
    expect(html).toContain('Eligible')
    expect(html).toContain('>Explain<')
    expect(html).not.toContain('Explain with AI')
    expect(html).not.toContain('Sparkles')
    expect(html).toContain('data-explain-state="empty"')
    expect(html).toContain(OPEN_ROLE_DEFINITION)
    expect(html).toContain('No end')
    expect(html).toContain('Last activity')
    expect(html).toContain('Microsoft Authenticator')
    expect(html).toContain('Approved')
    expect(html).not.toContain('Approved (2 of 2)')
    expect(html).toContain('Certified Jul 1, 2026')
    expect(html).toContain('Overdue since')
    expect(html).toContain('No ticket')
    expect(html).toContain('Success')
    expect(html).not.toContain('Sep 30')
    expect(html).toContain('sm:hidden')
    expect(html).toContain(PRIVILEGED_REVIEW_SUMMARY)
    expect(html).not.toContain('Emergency break-glass')
    expect(html).not.toMatch(/justification/i)
    const profile = privilegedProfileFixture(true)
    expect(html).toContain(String(profile.riskScore))
    expect(html).not.toContain('>88<')
    expect(html).not.toContain('critical')
  })

  it('shows the same overlay score on overview and profile for Lee Gu', () => {
    const detail = privilegedFixture(true)
    const profile = privilegedProfileFixture(true, 'id-lee')
    const overviewHtml = renderToStaticMarkup(
      createElement(PrivilegedOverview, { summary: detail.summary, highestRisk: detail.highestRisk }),
    )
    const holdersHtml = renderToStaticMarkup(
      createElement(HoldersTableStatic, {
        holders: detail.holders.filter((row) => row.identityId === 'id-lee'),
        pimAvailable: true,
      }),
    )
    const profileHtml = renderToStaticMarkup(createElement(IdentityProfile, { profile, aiEnabled: true }))
    expect(profile.riskScore).toBe(detail.holders.find((row) => row.identityId === 'id-lee')?.riskScore)
    expect(profileHtml).toContain(String(profile.riskScore))
    expect(holdersHtml).toContain(String(profile.riskScore))
    const onOverview = detail.highestRisk.some((row) => row.identityId === 'id-lee')
    if (onOverview) expect(overviewHtml).toContain(String(profile.riskScore))
  })

  it('hides the explain panel when AI is off', () => {
    const html = renderToStaticMarkup(
      createElement(IdentityProfile, {
        profile: privilegedDemoAdeleProfile(true),
        aiEnabled: false,
      }),
    )
    expect(html).not.toContain('Recommendation explanation')
    expect(html).not.toContain('Explain with AI')
    expect(html).not.toContain('AI explanations are off')
  })

  it('hides PIM activation history without P2 and still shows Explain when AI is on', () => {
    const html = renderToStaticMarkup(
      createElement(IdentityProfile, {
        profile: privilegedDemoAdeleProfile(false),
        aiEnabled: true,
      }),
    )
    expect(html).toContain('Adele Admin')
    expect(html).not.toContain(PIM_ACTIVATION_WINDOW)
    expect(html).not.toContain('PIM activation history')
    expect(html).toContain('>Explain<')
    expect(html).toContain('P2 needed to tell permanent from eligible')
    expect(html).not.toContain('Standing (permanent) Tier 0')
  })

  it('shows a gray failure state with Try again', () => {
    const html = renderToStaticMarkup(
      createElement(IdentityProfile, {
        profile: privilegedDemoAdeleProfile(true),
        aiEnabled: true,
        explainError: true,
      }),
    )
    expect(html).toContain('data-explain-state="error"')
    expect(html).toMatch(/Couldn(?:'|&#x27;)t generate an explanation/)
    expect(html).toContain('Try again')
    expect(html).not.toContain('AI explanations are off')
  })

  it('captions a filled explanation and offers Regenerate', () => {
    const base = privilegedDemoAdeleProfile(true)
    const html = renderToStaticMarkup(
      createElement(IdentityProfile, {
        profile: {
          ...base,
          explanation: {
            explanation:
              'Adele Admin: Review the score and any recommended assignment changes with the account owner or a Global Administrator before requesting a change. Top score factors: Standing (permanent) Tier 0 assignment (+30). Recommended assignment changes: Global Administrator: Convert to eligible.',
            created_at: '2026-11-21T12:00:00.000Z',
          },
        },
        aiEnabled: true,
      }),
    )
    expect(html).toContain(EXPLAIN_GENERATED_CAPTION)
    expect(html).toContain('Regenerate')
    expect(html).toContain('data-explain-state="ready"')
  })

  it('denies Read Only with a back link to privileged totals', () => {
    const html = renderToStaticMarkup(createElement(PrivilegedDetailDenied))
    expect(html).toContain(PRIVILEGED_DETAIL_DENIED)
    expect(html).toContain('href="/privileged"')
    expect(html).toContain('Privileged access')
  })

  it('links role holders to the identity profile', () => {
    const html = renderToStaticMarkup(createElement(HoldersTableStatic, { holders: p2.holders, pimAvailable: true }))
    expect(html).toContain('/privileged/id-lee')
    expect(html).toContain('/privileged/id-adele')
  })

  it('shows Adele Vance as Critical with matching assignment data', () => {
    const profile = privilegedProfileFixture(true, 'id-adele')
    const html = renderToStaticMarkup(createElement(IdentityProfile, { profile, aiEnabled: true }))
    expect(profile.riskLevel).toBe('critical')
    expect(html).toContain('text-[#991B1B]')
    expect(profile.assignments.filter((row) => row.roleName === 'Global Administrator')).toHaveLength(1)
  })

  it('scopes overlay queries to identities on the page', () => {
    const overlay = readFileSync(path.join(root, 'lib/scan/privileged-risk.ts'), 'utf8')
    expect(overlay).toContain('identityIds?: string[]')
    expect(overlay).toContain('.in(column, identityIds)')
    expect(overlay).toContain('privilegedIdentityIdsAmong')
    const guestsPage = readFileSync(path.join(root, 'app/(app)/guests/page.tsx'), 'utf8')
    expect(guestsPage).not.toContain('loadPrivilegedOverlayContexts')
    const guestDetail = readFileSync(path.join(root, 'app/(app)/guests/[id]/page.tsx'), 'utf8')
    expect(guestDetail).toContain('loadPrivilegedOverlayContexts(tenant.id, tenant.settings, [identity.id])')
    const list = readFileSync(path.join(root, 'lib/data/guests.ts'), 'utf8')
    expect(list).toContain('privilegedIdentityIdsAmong')
    expect(list).toContain('loadPrivilegedOverlayContexts(tenantId, settings, privilegedIds)')
  })

})
