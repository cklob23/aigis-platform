import { requireOnboarded } from '@/lib/auth/current'
import { can, ROLE_LABELS, type RoleKey } from '@/lib/auth/rbac'
import { listAdministrators } from '@/lib/data/governance'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminTable } from '@/components/settings/admin-table'
import { AddAdminForm } from '@/components/settings/add-admin-form'

const CAPABILITIES: { label: string; roles: RoleKey[] }[] = [
  { label: 'View dashboards & inventory', roles: ['global_admin', 'gs_admin', 'security_analyst', 'auditor', 'read_only'] },
  { label: 'View audit log', roles: ['global_admin', 'gs_admin', 'security_analyst', 'auditor'] },
  { label: 'Export reports & audit log', roles: ['global_admin', 'gs_admin', 'security_analyst', 'auditor'] },
  { label: 'Run scans, classify domains', roles: ['global_admin', 'gs_admin', 'security_analyst'] },
  { label: 'Create reviews & decide', roles: ['global_admin', 'gs_admin', 'security_analyst'] },
  { label: 'Request remediation', roles: ['global_admin', 'gs_admin', 'security_analyst'] },
  { label: 'Execute remediation in Microsoft 365', roles: ['global_admin', 'gs_admin'] },
  { label: 'Merge identities (reserved)', roles: ['global_admin', 'gs_admin'] },
  { label: 'Manage policies, settings, administrators', roles: ['global_admin', 'gs_admin'] },
  { label: 'Billing & all tenants (MSP)', roles: ['global_admin'] },
]
const ROLES: RoleKey[] = ['global_admin', 'gs_admin', 'security_analyst', 'auditor', 'read_only']

export default async function AdministratorsPage() {
  const { session, tenant } = await requireOnboarded()
  const admins = await listAdministrators(tenant.id)
  const canManage = can(session.role, 'admin.manage')

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Administrators</CardTitle>
          <CardDescription>People who can sign in to AIGIS for this tenant. Authentication is always via Microsoft Entra ID.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AdminTable admins={admins as never} canManage={canManage} currentUserId={session.userId} />
          {canManage && <AddAdminForm />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs">
                <th className="py-2 pr-4 font-normal">Capability</th>
                {ROLES.map((r) => (
                  <th key={r} className="px-2 py-2 text-center font-normal">
                    {ROLE_LABELS[r].replace('AIGIS ', '')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {CAPABILITIES.map((c) => (
                <tr key={c.label}>
                  <td className="py-2 pr-4">{c.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-2 py-2 text-center">
                      {c.roles.includes(r) ? <span className="inline-block size-2 rounded-full bg-primary" aria-label="Allowed" /> : <span className="inline-block size-2 rounded-full bg-muted" aria-label="Not allowed" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  )
}
