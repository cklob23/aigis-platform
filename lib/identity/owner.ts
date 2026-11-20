import type { IdentityClass, IdentityOwnerKind } from '@/lib/types'

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
  identity_class?: IdentityClass | string | null
}

export type OwnerView = {
  kind: IdentityOwnerKind
  label: string
  email: string | null
  href: string | null
  resolved: boolean
  internal: boolean
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
 * Link only to pages that already exist. Inventoried guest owners go to
 * /guests/{id}. human_internal has no identity profile route yet, so it
 * stays unlinked (plain text plus an Internal marker in the UI).
 */
export function ownerHref(owner: Pick<OwnerGuest, 'id' | 'identity_class'>): string | null {
  if (owner.identity_class === 'human_internal') return null
  return `/guests/${owner.id}`
}

function isInternalOwner(owner: Pick<OwnerGuest, 'identity_class'> | null | undefined) {
  return owner?.identity_class === 'human_internal'
}

export type SponsorRef = {
  sponsor_email: string | null
  sponsor_ms_object_id: string | null
}

/**
 * True when hub ownership is not the Entra sponsor (assigned/inferred, or a
 * linked identity whose email/oid does not match the sponsor). The Identity
 * card then shows a separate Owner row. owner_kind sponsor with the same
 * person stays on the Sponsor row only.
 */
export function ownerDiffersFromSponsor(
  identity: Pick<OwnerSource, 'owner_kind' | 'owner_identity_id' | 'owner_email' | 'owner_ms_object_id'> | null | undefined,
  sponsor: SponsorRef,
): boolean {
  if (!identity) return false
  if (identity.owner_kind === 'assigned' || identity.owner_kind === 'inferred') return true
  const ownerOid = identity.owner_ms_object_id
  const sponsorOid = sponsor.sponsor_ms_object_id
  if (ownerOid && sponsorOid && ownerOid !== sponsorOid) return true
  const ownerEmail = identity.owner_email?.toLowerCase() ?? null
  const sponsorEmail = sponsor.sponsor_email?.toLowerCase() ?? null
  if (ownerEmail && sponsorEmail && ownerEmail !== sponsorEmail) return true
  return false
}

/**
 * Presentation for hub ownership. Unresolved sponsors stay as email/oid.
 * A linked identity (guest or inventoried human_internal) is shown when
 * owner_identity_id already exists in inventory.
 */
export function describeOwner(source: OwnerSource, ownerGuest?: OwnerGuest | null): OwnerView {
  if (source.owner_kind === 'none' && !source.owner_identity_id && !source.owner_email && !source.owner_ms_object_id && !source.owner_display_name) {
    return { kind: 'none', label: 'None', email: null, href: null, resolved: false, internal: false }
  }
  if (ownerGuest) {
    return {
      kind: source.owner_kind === 'none' ? 'sponsor' : source.owner_kind,
      label: ownerGuest.display_name ?? ownerGuest.email ?? 'Linked identity',
      email: ownerGuest.email,
      href: ownerHref(ownerGuest),
      resolved: true,
      internal: isInternalOwner(ownerGuest),
    }
  }
  const label = source.owner_display_name ?? source.owner_email ?? source.owner_ms_object_id
  if (!label) {
    return { kind: source.owner_kind, label: KIND_LABEL[source.owner_kind], email: source.owner_email, href: null, resolved: false, internal: false }
  }
  return {
    kind: source.owner_kind === 'none' ? 'sponsor' : source.owner_kind,
    label,
    email: source.owner_email,
    href: null,
    resolved: false,
    internal: false,
  }
}
