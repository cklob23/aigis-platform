import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('QA copy nits', () => {
  it('uses an AIGIS administrator on the login error', () => {
    const src = readFileSync(path.join(root, 'app/auth/login/page.tsx'), 'utf8')
    expect(src).toContain('not an AIGIS administrator')
    expect(src).not.toContain('not a AIGIS')
  })

  it('defaults AppSidebar canViewAudit to false', () => {
    const src = readFileSync(path.join(root, 'components/layout/app-sidebar.tsx'), 'utf8')
    expect(src).toMatch(/canViewAudit\s*=\s*false/)
  })
})
