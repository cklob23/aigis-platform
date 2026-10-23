'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assignDomainToOrganization } from '@/lib/actions/organizations'
import { RELATIONSHIP_LABELS, type ExternalDomain, type ExternalOrganization } from '@/lib/types'

const NEW = '__new__'

export function AssignDomainDialog({
  domain,
  organizations,
  size = 'sm',
  variant = 'outline',
}: {
  domain: ExternalDomain
  organizations: Pick<ExternalOrganization, 'id' | 'name' | 'relationship_type'>[]
  size?: 'sm' | 'default' | 'xs'
  variant?: 'outline' | 'default' | 'ghost'
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<string>(domain.organization_id ?? NEW)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const items = Object.fromEntries([[NEW, 'Create a new organization…'], ...organizations.map((o) => [o.id, o.name])])

  const submit = (form: FormData) => {
    startTransition(async () => {
      const res = await assignDomainToOrganization({
        domainId: domain.id,
        organizationId: target === NEW ? null : target,
        newOrganizationName: String(form.get('newName') ?? ''),
        reason: String(form.get('reason') ?? ''),
      })
      if (res.ok) {
        toast.success(res.message)
        setOpen(false)
        router.refresh()
      } else toast.error(res.error)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size={size} variant={variant}>
            <Building2 data-icon="inline-start" /> Assign organization
          </Button>
        }
      />
      <DialogContent>
        <form action={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-mono">{domain.domain}</DialogTitle>
            <DialogDescription>Group this domain under the organization it really belongs to. All identities from the domain move with it and are reclassified.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="org">Organization</FieldLabel>
            <Select items={items} value={target} onValueChange={(v) => setTarget(v as string)}>
              <SelectTrigger id="org" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW}>Create a new organization…</SelectItem>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    <span className="ml-2 text-muted-foreground text-xs">{RELATIONSHIP_LABELS[o.relationship_type]}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {target === NEW && (
            <Field>
              <FieldLabel htmlFor="newName">New organization name</FieldLabel>
              <Input id="newName" name="newName" placeholder="e.g. Contoso Ltd" required />
              <FieldDescription>Starts with this domain&apos;s current classification and owner.</FieldDescription>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="reason">Reason for change</FieldLabel>
            <Input id="reason" name="reason" placeholder="Recorded in the audit log" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Assign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
