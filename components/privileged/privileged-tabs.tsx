'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type PrivilegedTab = 'overview' | 'holders' | 'roles' | 'remediation'

export function PrivilegedTabs({
  panels,
  counts,
  initial = 'overview',
}: {
  panels: Record<PrivilegedTab, ReactNode>
  counts: { holders: number; roles: number }
  initial?: PrivilegedTab
}) {
  const [tab, setTab] = useState<PrivilegedTab>(initial)
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as PrivilegedTab)} className="gap-4">
      <div className="relative">
        <div className="overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-16px),transparent)] sm:[mask-image:none]">
          <TabsList aria-label="Privileged access" className="min-w-max">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="holders">Role holders {counts.holders}</TabsTrigger>
            <TabsTrigger value="roles">Roles {counts.roles}</TabsTrigger>
            <TabsTrigger value="remediation">
              Remediation
              <span className="rounded bg-muted px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Soon
              </span>
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value="overview">{panels.overview}</TabsContent>
      <TabsContent value="holders">{panels.holders}</TabsContent>
      <TabsContent value="roles">{panels.roles}</TabsContent>
      <TabsContent value="remediation">{panels.remediation}</TabsContent>
    </Tabs>
  )
}
