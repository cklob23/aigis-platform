import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fetchAllById, SUPABASE_ROW_CAP } from '@/lib/supabase/page'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: String(i + 1).padStart(4, '0') }))
}

function fakeQuery<T>(all: T[]) {
  const ranges: [number, number][] = []
  return {
    ranges,
    createQuery: () => ({
      order: (column: string, options: { ascending: boolean }) => {
        expect(column).toBe('id')
        expect(options.ascending).toBe(true)
        return {
          range: async (from: number, to: number) => {
            ranges.push([from, to])
            return { data: all.slice(from, to + 1), error: null }
          },
        }
      },
    }),
  }
}

describe('fetchAllById', () => {
  it('pages past the 1000-row cap and returns 2500 rows in id order', async () => {
    const all = rows(2500)
    const fake = fakeQuery(all)
    const got = await fetchAllById('resource_memberships', fake.createQuery)
    expect(got).toHaveLength(2500)
    expect(got[0]?.id).toBe('0001')
    expect(got[1000]?.id).toBe('1001')
    expect(got[2499]?.id).toBe('2500')
    expect(fake.ranges).toEqual([
      [0, SUPABASE_ROW_CAP - 1],
      [SUPABASE_ROW_CAP, SUPABASE_ROW_CAP * 2 - 1],
      [SUPABASE_ROW_CAP * 2, SUPABASE_ROW_CAP * 3 - 1],
    ])
    expect(fake.ranges[0]?.[1] - fake.ranges[0]?.[0] + 1).toBe(1000)
  })

  it('returns a short first page without a second request', async () => {
    const fake = fakeQuery(rows(3))
    await expect(fetchAllById('guests', fake.createQuery)).resolves.toHaveLength(3)
    expect(fake.ranges).toEqual([[0, 999]])
  })

  it('throws with the query label when a page errors', async () => {
    await expect(
      fetchAllById('resource_memberships', () => ({
        order: () => ({
          range: async () => ({ data: null, error: { message: 'statement timeout' } }),
        }),
      })),
    ).rejects.toThrow('resource_memberships: statement timeout')
  })
})

describe('scan path pagination wiring', () => {
  it('pages tenant-wide scan and rescore selects by id', () => {
    const engine = readFileSync(path.join(root, 'lib/scan/engine.ts'), 'utf8')
    const privileged = readFileSync(path.join(root, 'lib/scan/privileged.ts'), 'utf8')
    const maps = readFileSync(path.join(root, 'lib/identity/governance-maps.ts'), 'utf8')
    const alerts = readFileSync(path.join(root, 'lib/alerts/evaluate.ts'), 'utf8')
    expect(engine).toMatch(/fetchAllById[\s\S]*'resource_memberships prior'/)
    expect(engine).toMatch(/fetchAllById[\s\S]*'resource_memberships rescore'/)
    expect(engine).toMatch(/fetchAllById[\s\S]*'guest_identities rescore'/)
    expect(engine).toMatch(/fetchAllById[\s\S]*'identities overlay'/)
    expect(engine).toMatch(/fetchAllById[\s\S]*'role_assignments overlay'/)
    expect(engine).toMatch(/fetchAllById[\s\S]*'group_pim_eligibilities overlay'/)
    expect(engine).toMatch(/planMembershipReconcile/)
    expect(privileged).toMatch(/fetchAllById/)
    expect(maps).toMatch(/fetchAllById/)
    expect(alerts).toMatch(/fetchAllById/)
  })

  it('keeps Graph membership GETs on getAll so @odata.nextLink is followed', () => {
    const client = readFileSync(path.join(root, 'lib/graph/client.ts'), 'utf8')
    const queries = readFileSync(path.join(root, 'lib/graph/queries.ts'), 'utf8')
    expect(client).toMatch(/async getAll/)
    expect(client).toMatch(/next = page\['@odata\.nextLink'\]/)
    expect(queries).toMatch(/fetchGroupMembers[\s\S]*g\.getAll/)
    expect(queries).toMatch(/fetchGroupOwners[\s\S]*g\.getAll/)
    expect(queries).toMatch(/fetchAppAssignments[\s\S]*g\.getAll/)
    expect(queries).not.toMatch(/g\.get<[^>]*>\(`\/groups\/\$\{groupId\}\/members/)
  })
})
