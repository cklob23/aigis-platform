// Applies SQL migrations in supabase/migrations in filename order.
// Usage: node scripts/migrate.mjs
import postgres from 'postgres'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING or POSTGRES_URL is required')
  process.exit(1)
}

const sql = postgres(url, { ssl: 'require', max: 1 })
const dir = path.join(process.cwd(), 'supabase', 'migrations')

try {
  await sql`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const applied = new Set((await sql`select name from _migrations`).map((r) => r.name))
  for (const file of files) {
    if (applied.has(file)) continue
    const body = await readFile(path.join(dir, file), 'utf8')
    console.log(`applying ${file}`)
    await sql.begin(async (tx) => {
      await tx.unsafe(body)
      await tx`insert into _migrations (name) values (${file})`
    })
  }
  console.log('migrations complete')
} finally {
  await sql.end()
}
