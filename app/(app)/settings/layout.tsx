import { PageHeader } from '@/components/layout/page-header'
import { SettingsNav } from '@/components/settings/settings-nav'

export const metadata = { title: 'Settings' }

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PageHeader title="Settings" description="Tenant connection, risk policy, detection rules, and administrators." />
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <SettingsNav />
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </div>
    </>
  )
}
