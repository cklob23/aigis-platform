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
  counts: { holders: number; roles: number; remediation: number }
  initial?: PrivilegedTab
}) {
  const [tab, setTab] = useState<PrivilegedTab>(initial)
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as PrivilegedTab)} className="gap-4">
      <TabsList aria-label="Privileged access">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="holders">Role holders {counts.holders}</TabsTrigger>
        <TabsTrigger value="roles">Roles {counts.roles}</TabsTrigger>
        <TabsTrigger value="remediation">Remediation {counts.remediation}</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{panels.overview}</TabsContent>
      <TabsContent value="holders">{panels.holders}</TabsContent>
      <TabsContent value="roles">{panels.roles}</TabsContent>
      <TabsContent value="remediation">{panels.remediation}</TabsContent>
    </Tabs>
  )
}
