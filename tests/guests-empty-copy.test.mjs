import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { guestsEmptyCopy } from '../lib/guests-empty-copy.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('high-risk filter with no results uses the approved empty copy', () => {
  assert.equal(guestsEmptyCopy({ risk: 'high' }), 'No high-risk external identities right now.')
})

test('every other filter combination keeps the generic empty copy', () => {
  const generic = 'No identities match these filters.'
  assert.equal(guestsEmptyCopy({}), generic)
  assert.equal(guestsEmptyCopy({ risk: 'critical' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'low' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', q: 'jordan' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', domain: 'partner.example' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', status: 'disabled' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', activity: 'inactive90' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', sponsor: 'none' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', review: 'pending' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', action: 'remove' }), generic)
  assert.equal(guestsEmptyCopy({ risk: 'high', cause: 'no_sponsor' }), generic)
  assert.equal(guestsEmptyCopy({ q: 'jordan' }), generic)
})

test('high-risk empty copy is wired on /guests and does not add the unapproved extra line', () => {
  const page = readFileSync(join(root, 'app/(app)/guests/page.tsx'), 'utf8')
  const table = readFileSync(join(root, 'components/guests/guest-table.tsx'), 'utf8')
  const helper = readFileSync(join(root, 'lib/guests-empty-copy.ts'), 'utf8')
  for (const src of [page, table, helper]) {
    assert.doesNotMatch(src, /Clear filters to see the full inventory/)
    assert.doesNotMatch(src, /—/)
  }
  assert.match(page, /emptyMessage=\{guestsEmptyCopy\(filters\)\}/)
  assert.match(table, /\{emptyMessage\}/)
})
