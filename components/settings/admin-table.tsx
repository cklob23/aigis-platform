'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { changeAdministratorRole, removeAdministrator } from '@/lib/actions/settings'
import { ROLE_LABELS, type RoleKey } from '@/lib/auth/rbac'
import { relativeDays } from '@/lib/format'

type Admin = { id: string; role_key: RoleKey; created_at: string; user: { id: string; email: string; display_name: string; last_login_at: string | null } }
const ROLES: RoleKey[] = ['gs_admin', 'security_analyst', 'auditor', 'read_only']

export function AdminTable({ admins, canManage, currentUserId }: { admins: Admin[]; canManage: boolean; currentUserId: string }) {
  const [, startTransition] = useTransition()
  const router = useRouter()
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
            <TableHead className="hidden md:table-cell">Added</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.map((a) => (
            <TableRow key={a.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {a.user.display_name}
                    {a.user.id === currentUserId && <span className="ml-2 text-muted-foreground text-xs">(you)</span>}
                  </span>
                  <span className="font-mono text-muted-foreground text-xs">{a.user.email}</span>
                </div>
              </TableCell>
              <TableCell>
                {canManage && a.user.id !== currentUserId ? (
                  <Select
                    items={ROLE_LABELS}
                    value={a.role_key}
                    onValueChange={(v) =>
                      startTransition(async () => {
                        const res = await changeAdministratorRole(a.id, v as RoleKey)
                        if (res.ok) router.refresh()
                        else toast.error(res.error)
                      })
                    }
                  >
                    <SelectTrigger size="sm" className="w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-sm">{ROLE_LABELS[a.role_key]}</span>
                )}
              </TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">{relativeDays(a.user.last_login_at)}</TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">{relativeDays(a.created_at)}</TableCell>
              <TableCell>
                {canManage && a.user.id !== currentUserId && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${a.user.email}`}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await removeAdministrator(a.id)
                        if (res.ok) router.refresh()
                        else toast.error(res.error)
                      })
                    }
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
