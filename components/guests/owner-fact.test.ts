import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OwnerFact } from '@/components/guests/owner-fact'
import { describeOwner } from '@/lib/identity/owner'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('OwnerFact on the guest page', () => {
  it('renders a resolved internal owner as name plus email without a missing-route link', () => {
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
    expect(html).not.toContain('/identities/')
    expect(html).not.toMatch(/<a\b/i)
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

  it('guest detail page uses OwnerFact and does not ship a /identities/{id} href', () => {
    const src = readFileSync(path.join(root, 'app/(app)/guests/[id]/page.tsx'), 'utf8')
    expect(src).toContain('OwnerFact')
    expect(src).not.toContain('/identities/')
  })
})
