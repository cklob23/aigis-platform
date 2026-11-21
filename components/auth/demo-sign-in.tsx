'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field, FieldLabel } from '@/components/ui/field'
import { ROLE_LABELS, type RoleKey } from '@/lib/auth/rbac'

const DEMO_ROLES: RoleKey[] = ['gs_admin', 'security_analyst', 'auditor', 'read_only']

export function DemoSignIn({ next }: { next?: string | null }) {
  const [role, setRole] = useState<RoleKey>('gs_admin')
  const [pending, setPending] = useState(false)

  return (
    <form method="post" action="/api/auth/demo" onSubmit={() => setPending(true)} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-sm">Explore the demo tenant</p>
        <p className="text-muted-foreground text-xs">Northwind Health · 186 guests · 20 external domains. No Microsoft account required.</p>
      </div>
      <Field>
        <FieldLabel htmlFor="demo-role">Sign in as</FieldLabel>
        <Select items={ROLE_LABELS} value={role} onValueChange={(v) => setRole(v as RoleKey)}>
          <SelectTrigger id="demo-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {DEMO_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <input type="hidden" name="role" value={role} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending && <Spinner data-icon="inline-start" />}
        {pending ? 'Preparing demo tenant…' : 'Open demo'}
      </Button>
    </form>
  )
}
