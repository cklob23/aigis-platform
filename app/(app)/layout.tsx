import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppTopbar } from '@/components/layout/app-topbar'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'
import { getSidebarCounts } from '@/lib/data/dashboard'
import { privilegedPagesEnabled } from '@/lib/privileged/capability'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, tenant } = await requireOnboarded()
  const counts = await getSidebarCounts(tenant.id)
  return (
    <SidebarProvider>
      <AppSidebar
        user={{ name: session.name, email: session.email, role: session.role, demo: session.demo }}
        tenant={{ displayName: tenant.display_name, primaryDomain: tenant.primary_domain, connectionStatus: tenant.connection_status }}
        counts={counts}
        canViewAudit={can(session.role, 'audit.view')}
        privilegedEnabled={privilegedPagesEnabled(tenant.settings)}
      />
      <SidebarInset className="min-w-0">
        <AppTopbar demo={session.demo} lastScanAt={tenant.last_scan_at} connectionStatus={tenant.connection_status} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
