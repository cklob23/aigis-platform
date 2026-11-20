import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { INTERNAL_CHIP_TITLE, OwnerFact, UNRESOLVED_CHIP_TITLE } from '@/components/guests/owner-fact'
import { describeOwner } from '@/lib/identity/owner'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('OwnerFact on the guest page', () => {
  it('renders a resolved internal sponsor as name plus email without a missing-route link', () => {
    const owner = describeOwner(
      {
        owner_kind: 'sponsor',
        owner_identity_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        owner_display_name: 'Pat Sponsor',
        owner_email: 'pat@contoso.example',
        owner_ms_object_id: '11111111-1111-1111-1111-111111111101',
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        display_name: 'Pat Sponsor',
        email: 'pat@contoso.example',
        identity_class: 'human_internal',
      },
    )
    const html = renderToStaticMarkup(createElement(OwnerFact, { owner, sponsorEnabled: true }))
    expect(html).toContain('Pat Sponsor')
    expect(html).toContain('pat@contoso.example')
    expect(html).toContain('Internal')
    expect(html).toContain(`title="${INTERNAL_CHIP_TITLE.replace("'", '&#x27;')}"`)
    expect(html).not.toContain('/identities/')
    expect(html).not.toMatch(/<a\b/i)
    expect(html).not.toMatch(/text-muted-foreground text-xs">Sponsor/)
  })

  it('puts Not in inventory on the name line as a chip and keeps the Entra name', () => {
    const owner = describeOwner({
      owner_kind: 'sponsor',
      owner_identity_id: null,
      owner_display_name: 'Casey Unlisted',
      owner_email: 'casey.unlisted@contoso.example',
      owner_ms_object_id: '99999999-9999-9999-9999-999999999999',
    })
    const html = renderToStaticMarkup(createElement(OwnerFact, { owner, sponsorEnabled: true }))
    expect(html).toMatch(/Casey Unlisted<span[^>]*title="Sponsor not found in the last scan"[^>]*>Not in inventory<\/span>/)
    expect(html).toContain('casey.unlisted@contoso.example')
    expect(html).toContain(`title="${UNRESOLVED_CHIP_TITLE}"`)
    expect(html).not.toMatch(/block text-muted-foreground text-xs">Not in inventory/)
  })

  it('uses the email as the primary line when Entra supplies no sponsor name', () => {
    const owner = describeOwner({
      owner_kind: 'sponsor',
      owner_identity_id: null,
      owner_display_name: null,
      owner_email: 'only@contoso.example',
      owner_ms_object_id: 'oid-only',
    })
    const html = renderToStaticMarkup(createElement(OwnerFact, { owner, sponsorEnabled: true }))
    expect(html).toContain('only@contoso.example')
    expect(html).toContain('Not in inventory')
    expect(html.match(/only@contoso.example/g)?.length).toBe(1)
  })

  it('still links an inventoried guest owner to the existing guest page', () => {
    const owner = describeOwner(
      {
        owner_kind: 'sponsor',
        owner_identity_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        owner_display_name: 'Guest A',
        owner_email: 'a@ex.example',
        owner_ms_object_id: 'oid-a',
      },
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', display_name: 'Guest A', email: 'a@ex.example' },
    )
    const html = renderToStaticMarkup(createElement(OwnerFact, { owner, sponsorEnabled: true }))
    expect(html).toContain('href="/guests/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"')
    expect(html).not.toContain('/identities/')
  })

  it('guest detail page labels the Entra sponsor as Sponsor and does not ship a /identities/{id} href', () => {
    const src = readFileSync(path.join(root, 'app/(app)/guests/[id]/page.tsx'), 'utf8')
    expect(src).toContain('OwnerFact')
    expect(src).toContain("label: 'Sponsor'")
    expect(src).toContain('ownerDiffersFromSponsor')
    expect(src).not.toContain('/identities/')
  })
})
