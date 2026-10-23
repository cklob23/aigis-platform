'use client'

import { useState, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export type ReviewTab = 'active' | 'overdue' | 'completed'

export function ReviewTabs({ counts, panels, initial = 'active' }: { counts: Record<ReviewTab, number>; panels: Record<ReviewTab, ReactNode>; initial?: ReviewTab }) {
  const [tab, setTab] = useState<ReviewTab>(initial)
  const tnum = (n: number, warn?: boolean) => <span className={`tnum ml-1.5 font-mono text-xs ${warn && n > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{n}</span>
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewTab)} className="gap-4">
      <TabsList aria-label="Review status">
        <TabsTrigger value="active">Active{tnum(counts.active)}</TabsTrigger>
        <TabsTrigger value="overdue">Overdue{tnum(counts.overdue, true)}</TabsTrigger>
        <TabsTrigger value="completed">Completed{tnum(counts.completed)}</TabsTrigger>
      </TabsList>
      <TabsContent value="active">{panels.active}</TabsContent>
      <TabsContent value="overdue">{panels.overdue}</TabsContent>
      <TabsContent value="completed">{panels.completed}</TabsContent>
    </Tabs>
  )
}
