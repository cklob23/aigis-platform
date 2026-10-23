'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { classifyDomain } from '@/lib/actions/governance'
import { DOMAIN_CLASSIFICATION_LABELS, type DomainClassification, type ExternalDomain } from '@/lib/types'

const ORDER: DomainClassification[] = ['approved_partner', 'client', 'vendor', 'contractor', 'temporary', 'unknown', 'blocked']

export function ClassifyDomainDialog({ domain, size = 'sm', variant = 'outline' }: { domain: ExternalDomain; size?: 'sm' | 'default' | 'xs'; variant?: 'outline' | 'default' | 'ghost' }) {
  const [open, setOpen] = useState(false)
  const [classification, setClassification] = useState<DomainClassification>(domain.classification)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const submit = (form: FormData) => {
    startTransition(async () => {
      const res = await classifyDomain({
        domainId: domain.id,
        classification,
        businessOwner: String(form.get('owner') ?? ''),
        reviewDate: String(form.get('reviewDate') ?? ''),
        notes: String(form.get('notes') ?? ''),
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
            <Tag data-icon="inline-start" /> Classify
          </Button>
        }
      />
      <DialogContent>
        <form action={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="font-mono">{domain.domain}</DialogTitle>
            <DialogDescription>Classification feeds the risk engine: blocked domains force removal, unknown domains add risk, approved partners reduce noise.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="cls">Classification</FieldLabel>
            <Select items={DOMAIN_CLASSIFICATION_LABELS} value={classification} onValueChange={(v) => setClassification(v as DomainClassification)}>
              <SelectTrigger id="cls" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {DOMAIN_CLASSIFICATION_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="owner">Business owner</FieldLabel>
              <Input id="owner" name="owner" defaultValue={domain.business_owner ?? ''} placeholder="Team or person" />
            </Field>
            <Field>
              <FieldLabel htmlFor="reviewDate">Review / expiry date</FieldLabel>
              <Input id="reviewDate" name="reviewDate" type="date" defaultValue={domain.review_date ?? ''} />
              <FieldDescription>Required for temporary engagements.</FieldDescription>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" name="notes" rows={2} defaultValue={domain.notes ?? ''} placeholder="Contract reference, scope, contacts…" />
          </Field>
          <Field>
            <FieldLabel htmlFor="reason">Reason for change</FieldLabel>
            <Input id="reason" name="reason" placeholder="Recorded in the audit log" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save classification'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
