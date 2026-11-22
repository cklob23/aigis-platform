import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { privilegedIdsInSet } from '@/lib/privileged/ids'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('privilegedIdsInSet', () => {
  it('matches a few privileged ids inside a large guest set without sending the set as one filter', () => {
    const among = Array.from({ length: 400 }, (_, i) => `guest-${i}`)
    among[12] = 'id-grady'
    among[180] = 'id-vendor'
    among[399] = 'id-morgan'
    expect(privilegedIdsInSet(['id-grady', 'id-vendor', 'id-morgan', 'id-other'], among).sort()).toEqual([
      'id-grady',
      'id-morgan',
      'id-vendor',
    ])
    expect(privilegedIdsInSet(['id-grady'], [])).toEqual([])
    const overlay = readFileSync(path.join(root, 'lib/scan/privileged-risk.ts'), 'utf8')
    const amongFn = overlay.slice(
      overlay.indexOf('export async function privilegedIdentityIdsAmong'),
      overlay.indexOf('export async function loadPrivilegedOverlayContexts'),
    )
    expect(amongFn).toContain("eq('identity_class', 'external')")
    expect(amongFn).toContain('privilegedIdsInSet')
    expect(amongFn).not.toContain('scopedQuery')
  })
})
