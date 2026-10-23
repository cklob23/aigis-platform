'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export type AlertTab = 'open' | 'acknowledged' | 'resolved'

export function AlertTabs({ counts, panels, initial = 'open' }: { counts: Record<AlertTab, number>; panels: Record<AlertTab, ReactNode>; initial?: AlertTab }) {
  const [tab, setTab] = useState<AlertTab>(initial)
  const tnum = (n: number) => <span className="tnum ml-1.5 font-mono text-muted-foreground text-xs">{n}</span>
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as AlertTab)} className="gap-4">
      <TabsList aria-label="Alert status">
        <TabsTrigger value="open">Open{tnum(counts.open)}</TabsTrigger>
        <TabsTrigger value="acknowledged">Acknowledged{tnum(counts.acknowledged)}</TabsTrigger>
        <TabsTrigger value="resolved">Resolved / Dismissed{tnum(counts.resolved)}</TabsTrigger>
      </TabsList>
      <TabsContent value="open">{panels.open}</TabsContent>
      <TabsContent value="acknowledged">{panels.acknowledged}</TabsContent>
      <TabsContent value="resolved">{panels.resolved}</TabsContent>
    </Tabs>
  )
}
