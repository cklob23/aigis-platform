'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { bulkClassifyDomains } from '@/lib/actions/governance'
import { DOMAIN_CLASSIFICATION_LABELS, type DomainClassification } from '@/lib/types'

const ORDER: DomainClassification[] = ['approved_partner', 'client', 'vendor', 'contractor', 'temporary', 'unknown', 'blocked']
const KEEP = '__keep__'

export function BulkClassifyDialog({ domainIds, domainNames, onDone }: { domainIds: string[]; domainNames: string[]; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [classification, setClassification] = useState<string>(KEEP)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const submit = (form: FormData) => {
    startTransition(async () => {
      const res = await bulkClassifyDomains({
        domainIds,
        classification: classification === KEEP ? undefined : (classification as DomainClassification),
        businessOwner: String(form.get('owner') ?? ''),
        reviewDate: String(form.get('reviewDate') ?? ''),
        reason: String(form.get('reason') ?? ''),
      })
      if (res.ok) {
        toast.success(res.message)
        setOpen(false)
        onDone?.()
        router.refresh()
      } else toast.error(res.error)
    })
  }

  const items = { [KEEP]: 'Leave unchanged', ...DOMAIN_CLASSIFICATION_LABELS }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Tags data-icon="inline-start" /> Classify or assign owner
          </Button>
        }
      />
      <DialogContent>
        <form action={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              Update {domainIds.length} domain{domainIds.length === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              <span className="line-clamp-2 font-mono text-xs">{domainNames.slice(0, 6).join(', ')}{domainNames.length > 6 && ` +${domainNames.length - 6} more`}</span>
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="bulk-cls">Classification</FieldLabel>
            <Select items={items} value={classification} onValueChange={(v) => setClassification(v as string)}>
              <SelectTrigger id="bulk-cls" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Leave unchanged</SelectItem>
                {ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {DOMAIN_CLASSIFICATION_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Changing classification re-scores every identity on these domains.</FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bulk-owner">Business owner</FieldLabel>
              <Input id="bulk-owner" name="owner" placeholder="Leave blank to keep" />
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-reviewDate">Review / expiry date</FieldLabel>
              <Input id="bulk-reviewDate" name="reviewDate" type="date" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="bulk-reason">Reason for change</FieldLabel>
            <Input id="bulk-reason" name="reason" placeholder="Recorded on each audit event" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Applying…' : `Apply to ${domainIds.length}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
