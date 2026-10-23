import postgres from 'postgres'

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
if (!url) {
  console.error('POSTGRES_URL is not set')
  process.exit(1)
}

const sql = postgres(url, { ssl: 'require', max: 1 })
const DEMO_MS_TENANT_ID = 'demo-northwind-health'

try {
  const tenants = await sql`select id, organization_id from tenants where ms_tenant_id = ${DEMO_MS_TENANT_ID} or is_demo = true`
  const orgIds = [...new Set(tenants.map((t) => t.organization_id))]
  // Deleting the organization cascades through tenants and every tenant-scoped table.
  const orgs = orgIds.length ? await sql`delete from organizations where id = any(${orgIds}::uuid[]) returning id` : []
  const users = await sql`delete from users where ms_tenant_id = ${DEMO_MS_TENANT_ID} returning id`
  console.log(`Removed ${orgs.length} demo organization(s), ${tenants.length} demo tenant(s), ${users.length} demo user(s).`)
} finally {
  await sql.end()
}
