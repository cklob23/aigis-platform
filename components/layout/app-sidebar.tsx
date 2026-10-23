'use client'

import { useRef } from 'react'
import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  Globe,
  FolderLock,
  ClipboardCheck,
  ScrollText,
  FileBarChart,
  Settings,
  RadarIcon,
  ShieldAlert,
  LogOut,
  ChevronsUpDown,
  Building2,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { Logo } from '@/components/brand/logo'
import { cn } from '@/lib/utils'
import { ROLE_LABELS, type RoleKey } from '@/lib/auth/rbac'
import { initials } from '@/lib/format'

export type SidebarUser = { name: string; email: string; role: RoleKey; demo: boolean }
export type SidebarTenant = { displayName: string; primaryDomain: string | null; connectionStatus: string }
export type SidebarCounts = { critical: number; openAlerts: number; pendingReviews: number }

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/guests', label: 'External identities', icon: Users, badge: 'critical' as const },
  { href: '/organizations', label: 'External organizations', icon: Building2 },
  { href: '/domains', label: 'Domains', icon: Globe },
  { href: '/resources', label: 'Resources', icon: FolderLock },
  { href: '/alerts', label: 'Alerts', icon: ShieldAlert, badge: 'openAlerts' as const },
]
const GOVERN = [
  { href: '/reviews', label: 'Access reviews', icon: ClipboardCheck, badge: 'pendingReviews' as const },
  { href: '/scans', label: 'Scans', icon: RadarIcon },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/audit', label: 'Audit log', icon: ScrollText },
]

const BADGE_MEANING: Record<keyof SidebarCounts, (n: number) => string> = {
  critical: (n) => `${n} critical-risk ${n === 1 ? 'identity' : 'identities'} (not the total count)`,
  openAlerts: (n) => `${n} open ${n === 1 ? 'alert' : 'alerts'}`,
  pendingReviews: (n) => `${n} review ${n === 1 ? 'decision' : 'decisions'} pending`,
}

/** Swaps the nav icon for a spinner while this link's navigation is in flight. */
function NavIcon({ icon: Icon }: { icon: React.ComponentType<{ className?: string }> }) {
  const { pending } = useLinkStatus()
  return pending ? <Spinner className="size-4" /> : <Icon />
}

export function AppSidebar({ user, tenant, counts }: { user: SidebarUser; tenant: SidebarTenant; counts: SidebarCounts }) {
  const pathname = usePathname()
  const signOutFormRef = useRef<HTMLFormElement>(null)
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const renderGroup = (items: typeof NAV | typeof GOVERN) =>
    items.map((item) => {
      const badgeKey = 'badge' in item && item.badge ? item.badge : null
      const badge = badgeKey ? counts[badgeKey] : 0
      const active = isActive(item.href)
      return (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton isActive={active} tooltip={item.label} render={<Link href={item.href} aria-current={active ? 'page' : undefined} />}>
            <NavIcon icon={item.icon} />
            <span>{item.label}</span>
          </SidebarMenuButton>
          {badge > 0 && badgeKey && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <SidebarMenuBadge className={cn('cursor-help', badgeKey === 'critical' && 'text-destructive')} aria-label={BADGE_MEANING[badgeKey](badge)}>
                    {badgeKey === 'critical' && <span className="mr-0.5 size-1.5 rounded-full bg-destructive" aria-hidden />}
                    {badge}
                  </SidebarMenuBadge>
                }
              />
              <TooltipContent side="right">{BADGE_MEANING[badgeKey](badge)}</TooltipContent>
            </Tooltip>
          )}
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b px-3 group-data-[collapsible=icon]:px-2">
        <Link href="/dashboard" className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo className="group-data-[collapsible=icon]:hidden" />
          <Logo compact className="hidden group-data-[collapsible=icon]:flex" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Inventory</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderGroup(NAV)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Governance</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{renderGroup(GOVERN)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isActive('/settings')} tooltip="Settings" render={<Link href="/settings" />}>
                  <Settings />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs group-data-[collapsible=icon]:hidden">
              <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{tenant.displayName}</span>
                <span className="truncate font-mono text-muted-foreground">{tenant.primaryDomain ?? tenant.connectionStatus}</span>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <Avatar className="size-7 rounded-md">
                  <AvatarFallback className="rounded-md bg-primary/15 text-primary text-xs">{initials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">{ROLE_LABELS[user.role]}</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                {/* Base UI requires GroupLabel to live inside a Group; a bare label throws and takes the page down. */}
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex flex-col">
                    <span className="truncate">{user.email}</span>
                    <span className="font-normal text-muted-foreground text-xs">{user.demo ? 'Demo session' : 'Microsoft Entra ID'}</span>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem nativeButton={false} render={<Link href="/settings" />}>
                  <Settings /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOutFormRef.current?.requestSubmit()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <form ref={signOutFormRef} action="/api/auth/logout" method="post" className="hidden" aria-hidden />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
