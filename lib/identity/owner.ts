import type { IdentityOwnerKind } from '@/lib/types'

export type OwnerSource = {
  owner_kind: IdentityOwnerKind
  owner_identity_id: string | null
  owner_display_name: string | null
  owner_email: string | null
  owner_ms_object_id: string | null
}

export type OwnerGuest = {
  id: string
  display_name: string | null
  email: string | null
}

export type OwnerView = {
  kind: IdentityOwnerKind
  label: string
  email: string | null
  href: string | null
  resolved: boolean
}

const KIND_LABEL: Record<IdentityOwnerKind, string> = {
  none: 'None',
  sponsor: 'Sponsor',
  assigned: 'Assigned',
  inferred: 'Inferred',
}

export function ownerKindLabel(kind: IdentityOwnerKind) {
  return KIND_LABEL[kind]
}

/**
 * Presentation for hub ownership. No employee ingest: unresolved sponsors
 * stay as email/oid. A linked guest is only shown when owner_identity_id
 * already exists in inventory.
 */
export function describeOwner(source: OwnerSource, ownerGuest?: OwnerGuest | null): OwnerView {
  if (source.owner_kind === 'none' && !source.owner_identity_id && !source.owner_email && !source.owner_ms_object_id && !source.owner_display_name) {
    return { kind: 'none', label: 'None', email: null, href: null, resolved: false }
  }
  if (ownerGuest) {
    return {
      kind: source.owner_kind === 'none' ? 'sponsor' : source.owner_kind,
      label: ownerGuest.display_name ?? ownerGuest.email ?? 'Linked identity',
      email: ownerGuest.email,
      href: `/guests/${ownerGuest.id}`,
      resolved: true,
    }
  }
  const label = source.owner_display_name ?? source.owner_email ?? source.owner_ms_object_id
  if (!label) {
    return { kind: source.owner_kind, label: KIND_LABEL[source.owner_kind], email: source.owner_email, href: null, resolved: false }
  }
  return {
    kind: source.owner_kind === 'none' ? 'sponsor' : source.owner_kind,
    label,
    email: source.owner_email,
    href: null,
    resolved: false,
  }
}
