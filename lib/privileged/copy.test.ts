import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DASHBOARD_SUBTITLE_GUESTS_ONLY, DASHBOARD_SUBTITLE_PRIVILEGED, REMEDIATION_PLACEHOLDER } from '@/lib/privileged/copy'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('dashboard subtitle copy', () => {
  it('keeps the exact on and off strings and switches them from the flag', () => {
    expect(DASHBOARD_SUBTITLE_GUESTS_ONLY).toBe(
      'Governing external identities today. Privileged, non-human, and AI agent types will use the same reviews and audit model.',
    )
    expect(DASHBOARD_SUBTITLE_PRIVILEGED).toBe(
      'Governing external and privileged access today. Non-human and AI agent types will use the same reviews and audit model.',
    )
    const dashboard = readFileSync(path.join(root, 'app/(app)/dashboard/page.tsx'), 'utf8')
    expect(dashboard).toContain('privilegedEnabled ? DASHBOARD_SUBTITLE_PRIVILEGED : DASHBOARD_SUBTITLE_GUESTS_ONLY')
    expect(DASHBOARD_SUBTITLE_GUESTS_ONLY).not.toMatch(/\u2014/)
    expect(DASHBOARD_SUBTITLE_PRIVILEGED).not.toMatch(/\u2014/)
  })

  it('keeps More identity types coming under External identities, not Alerts', () => {
    const sidebar = readFileSync(path.join(root, 'components/layout/app-sidebar.tsx'), 'utf8')
    expect(sidebar).toContain("item.href === '/guests' &&")
    expect(sidebar).toContain('More identity types coming')
    expect(sidebar).not.toMatch(/Alerts[\s\S]{0,200}More identity types coming/)
  })

  it('uses the coming-soon remediation copy', () => {
    expect(REMEDIATION_PLACEHOLDER).toContain('Mark change made')
    expect(REMEDIATION_PLACEHOLDER).toContain('AIGIS confirms it on the next scan')
  })
})
