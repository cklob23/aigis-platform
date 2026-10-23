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
import { bulkUpdateOrganizations } from '@/lib/actions/organizations'
import { APPROVAL_LABELS, RELATIONSHIP_LABELS, type ApprovalState, type RelationshipType } from '@/lib/types'

const RELATIONSHIP_ORDER: RelationshipType[] = ['partner', 'client', 'vendor', 'contractor', 'temporary', 'unknown', 'former', 'blocked']
const APPROVAL_ORDER: ApprovalState[] = ['unreviewed', 'approved', 'restricted', 'blocked']
const KEEP = '__keep__'

export function BulkUpdateOrganizationsDialog({ organizationIds, names, onDone }: { organizationIds: string[]; names: string[]; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [relationship, setRelationship] = useState<string>(KEEP)
  const [approval, setApproval] = useState<string>(KEEP)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const submit = (form: FormData) => {
    startTransition(async () => {
      const res = await bulkUpdateOrganizations({
        organizationIds,
        relationshipType: relationship === KEEP ? undefined : (relationship as RelationshipType),
        approvalState: approval === KEEP ? undefined : (approval as ApprovalState),
        businessOwner: String(form.get('owner') ?? ''),
        businessOwnerEmail: String(form.get('ownerEmail') ?? ''),
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Tags data-icon="inline-start" /> Classify or assign owner
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form action={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              Update {organizationIds.length} organization{organizationIds.length === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              <span className="line-clamp-2 text-xs">{names.slice(0, 6).join(', ')}{names.length > 6 && ` +${names.length - 6} more`}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bulk-rel">Relationship</FieldLabel>
              <Select items={{ [KEEP]: 'Leave unchanged', ...RELATIONSHIP_LABELS }} value={relationship} onValueChange={(v) => setRelationship(v as string)}>
                <SelectTrigger id="bulk-rel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Leave unchanged</SelectItem>
                  {RELATIONSHIP_ORDER.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RELATIONSHIP_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-appr">Approval state</FieldLabel>
              <Select items={{ [KEEP]: 'Leave unchanged', ...APPROVAL_LABELS }} value={approval} onValueChange={(v) => setApproval(v as string)}>
                <SelectTrigger id="bulk-appr" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>Leave unchanged</SelectItem>
                  {APPROVAL_ORDER.map((a) => (
                    <SelectItem key={a} value={a}>
                      {APPROVAL_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <FieldDescription>Changing the relationship re-classifies and re-scores every identity in these organizations.</FieldDescription>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="bulk-owner">Business owner</FieldLabel>
              <Input id="bulk-owner" name="owner" placeholder="Leave blank to keep" />
            </Field>
            <Field>
              <FieldLabel htmlFor="bulk-ownerEmail">Owner email</FieldLabel>
              <Input id="bulk-ownerEmail" name="ownerEmail" type="email" placeholder="owner@yourcompany.com" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="bulk-reviewDate">Review / expiry date</FieldLabel>
            <Input id="bulk-reviewDate" name="reviewDate" type="date" />
          </Field>
          <Field>
            <FieldLabel htmlFor="bulk-reason">Reason for change</FieldLabel>
            <Input id="bulk-reason" name="reason" placeholder="Recorded on each audit event" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Applying…' : `Apply to ${organizationIds.length}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
