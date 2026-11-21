import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DASHBOARD_SUBTITLE_GUESTS_ONLY, DASHBOARD_SUBTITLE_PRIVILEGED } from '@/lib/privileged/copy'

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
})
