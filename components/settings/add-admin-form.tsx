'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addAdministrator } from '@/lib/actions/settings'
import { ROLE_LABELS, type RoleKey } from '@/lib/auth/rbac'

const ROLES: RoleKey[] = ['gs_admin', 'security_analyst', 'auditor', 'read_only']

export function AddAdminForm() {
  const [role, setRole] = useState<RoleKey>('security_analyst')
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 md:flex-row md:items-end"
      action={(form) =>
        startTransition(async () => {
          const res = await addAdministrator({ email: String(form.get('email')), name: String(form.get('name')), role })
          if (res.ok) {
            toast.success(res.message)
            router.refresh()
          } else toast.error(res.error)
        })
      }
    >
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="adm-email">Work email</FieldLabel>
          <Input id="adm-email" name="email" type="email" required placeholder="name@company.com" />
        </Field>
        <Field className="min-w-0 flex-1">
          <FieldLabel htmlFor="adm-name">Name</FieldLabel>
          <Input id="adm-name" name="name" placeholder="Optional" />
        </Field>
        <Field className="md:w-56 md:flex-none">
          <FieldLabel htmlFor="adm-role">Role</FieldLabel>
          <Select items={ROLE_LABELS} value={role} onValueChange={(v) => setRole(v as RoleKey)}>
            <SelectTrigger id="adm-role" className="w-full">
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
      </Field>
      <Button type="submit" disabled={pending}>
        <UserPlus data-icon="inline-start" /> {pending ? 'Adding…' : 'Add'}
      </Button>
    </form>
  )
}
