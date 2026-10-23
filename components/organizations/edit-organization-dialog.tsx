'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateOrganization } from '@/lib/actions/organizations'
import { APPROVAL_LABELS, RELATIONSHIP_LABELS, type ApprovalState, type ExternalOrganization, type RelationshipType } from '@/lib/types'

const RELATIONSHIP_ORDER: RelationshipType[] = ['partner', 'client', 'vendor', 'contractor', 'temporary', 'unknown', 'former', 'blocked']
const APPROVAL_ORDER: ApprovalState[] = ['unreviewed', 'approved', 'restricted', 'blocked']

export function EditOrganizationDialog({ organization, size = 'sm', variant = 'outline' }: { organization: ExternalOrganization; size?: 'sm' | 'default' | 'xs'; variant?: 'outline' | 'default' | 'ghost' }) {
  const [open, setOpen] = useState(false)
  const [relationship, setRelationship] = useState<RelationshipType>(organization.relationship_type)
  const [approval, setApproval] = useState<ApprovalState>(organization.approval_state)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const submit = (form: FormData) => {
    startTransition(async () => {
      const res = await updateOrganization({
        organizationId: organization.id,
        name: String(form.get('name') ?? ''),
        relationshipType: relationship,
        approvalState: approval,
        businessOwner: String(form.get('owner') ?? ''),
        businessOwnerEmail: String(form.get('ownerEmail') ?? ''),
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
            <Pencil data-icon="inline-start" /> Edit organization
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <form action={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Organization relationship</DialogTitle>
            <DialogDescription>
              Relationship type is a strong classification signal for every identity in this organization and flows into risk scoring. Approval state records the governance decision.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="org-name">Name</FieldLabel>
            <Input id="org-name" name="name" defaultValue={organization.name} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="rel">Relationship</FieldLabel>
              <Select items={RELATIONSHIP_LABELS} value={relationship} onValueChange={(v) => setRelationship(v as RelationshipType)}>
                <SelectTrigger id="rel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_ORDER.map((r) => (
                    <SelectItem key={r} value={r}>
                      {RELATIONSHIP_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="appr">Approval state</FieldLabel>
              <Select items={APPROVAL_LABELS} value={approval} onValueChange={(v) => setApproval(v as ApprovalState)}>
                <SelectTrigger id="appr" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {APPROVAL_ORDER.map((a) => (
                    <SelectItem key={a} value={a}>
                      {APPROVAL_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="owner">Business owner</FieldLabel>
              <Input id="owner" name="owner" defaultValue={organization.business_owner ?? ''} placeholder="Team or person" />
            </Field>
            <Field>
              <FieldLabel htmlFor="ownerEmail">Owner email</FieldLabel>
              <Input id="ownerEmail" name="ownerEmail" type="email" defaultValue={organization.business_owner_email ?? ''} placeholder="owner@yourcompany.com" />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="reviewDate">Review / expiry date</FieldLabel>
            <Input id="reviewDate" name="reviewDate" type="date" defaultValue={organization.review_date ?? ''} />
            <FieldDescription>Required for temporary engagements. Identities inherit this date for review scheduling.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" name="notes" rows={2} defaultValue={organization.notes ?? ''} placeholder="Contract reference, scope, contacts…" />
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
              {pending ? 'Saving…' : 'Save organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
