import { PageHeader } from '@/components/layout/page-header'
import { SettingsNav } from '@/components/settings/settings-nav'
import { requireOnboarded } from '@/lib/auth/current'
import { can } from '@/lib/auth/rbac'

export const metadata = { title: 'Settings' }

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireOnboarded()
  return (
    <>
      <PageHeader title="Settings" description="Tenant connection, risk policy, detection rules, and administrators." />
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <SettingsNav showPrivileged={can(session.role, 'settings.manage')} />
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </>
  )
}
