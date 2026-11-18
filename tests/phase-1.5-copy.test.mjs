import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

test('sidebar footnote under External identities is exact approved copy', () => {
  const src = read('components/layout/app-sidebar.tsx')
  assert.match(src, /href=\{item\.href\}/)
  assert.match(src, /item\.href === '\/guests'/)
  assert.match(src, /id="nav-external-identities-footnote"/)
  assert.match(src, /aria-describedby=\{item\.href === '\/guests' \? 'nav-external-identities-footnote' : undefined\}/)
  assert.equal((src.match(/More identity types coming/g) ?? []).length, 1)
  assert.doesNotMatch(src, /—/)
})

test('dashboard populated subtitle is exact approved copy under the existing description', () => {
  const dashboard = read('app/(app)/dashboard/page.tsx')
  const header = read('components/layout/page-header.tsx')
  assert.match(dashboard, /external identities across/)
  assert.match(
    dashboard,
    /subtitle="Governing external identities today\. Privileged, non-human, and AI agent types will use the same reviews and audit model\."/,
  )
  assert.match(header, /subtitle &&/)
  assert.doesNotMatch(dashboard, /—/)
  assert.doesNotMatch(header, /—/)
})
