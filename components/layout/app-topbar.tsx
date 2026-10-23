'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun, FlaskConical } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { relativeDays } from '@/lib/format'

export function AppTopbar({ demo, lastScanAt, connectionStatus }: { demo: boolean; lastScanAt: string | null; connectionStatus: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-5" />
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span
          aria-hidden
          className={connectionStatus === 'connected' ? 'size-1.5 rounded-full bg-success' : connectionStatus === 'error' ? 'size-1.5 rounded-full bg-destructive' : 'size-1.5 rounded-full bg-warning'}
        />
        <span className="hidden sm:inline">{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'error' ? 'Connection error' : 'Awaiting consent'}</span>
        <span className="hidden font-mono md:inline">· last scan {relativeDays(lastScanAt).toLowerCase()}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {demo && (
          <Badge variant="outline" className="gap-1 border-warning/50 text-warning">
            <FlaskConical className="size-3" /> Demo tenant
          </Badge>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>
      </div>
    </div>
  )
}
