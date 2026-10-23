'use server'

import { revalidatePath } from 'next/cache'
import { requireContext, assertCan } from '@/lib/auth/current'
import { db } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { rescoreTenant } from '@/lib/scan/engine'
import { classifyExternalIdentity } from '@/lib/identity/classify'
import type { ApprovalState, DomainClassification, ExternalOrganization, Guest, RelationshipType } from '@/lib/types'

type ActionResult = { ok: true; message?: string } | { ok: false; error: string }

function fail(err: unknown): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }
}

/** Mirror an organization's relationship onto the legacy domain classification so risk scoring stays consistent. */
const RELATIONSHIP_TO_DOMAIN_CLASS: Record<RelationshipType, DomainClassification> = {
  partner: 'approved_partner',
  vendor: 'vendor',
  contractor: 'contractor',
  client: 'client',
  temporary: 'temporary',
  unknown: 'unknown',
  former: 'blocked',
  blocked: 'blocked',
}

function revalidateOrganizationViews(orgId?: string) {
  revalidatePath('/organizations')
  if (orgId) revalidatePath(`/organizations/${orgId}`)
  revalidatePath('/domains')
  revalidatePath('/identities')
  revalidatePath('/guests')
  revalidatePath('/dashboard')
}

/** Re-run identity classification for every identity in an organization (relationship type is a strong signal). */
async function reclassifyOrganization(tenantId: string, org: Pick<ExternalOrganization, 'id' | 'relationship_type'>, verifiedDomains: string[]) {
  const supabase = db()
  const { data: identities } = await supabase
    .from('guest_identities')
    .select('id,user_type,upn,email,invitation_status,company_name,domain')
    .eq('tenant_id', tenantId)
    .eq('external_organization_id', org.id)
    .is('removed_at', null)
  for (const g of (identities ?? []) as Pick<Guest, 'id' | 'user_type' | 'upn' | 'email' | 'invitation_status' | 'company_name' | 'domain'>[]) {
    const result = classifyExternalIdentity({
      userType: g.user_type,
      userPrincipalName: g.upn,
      mail: g.email,
      externalUserState: g.invitation_status,
      companyName: g.company_name,
      domain: g.domain,
      tenantVerifiedDomains: verifiedDomains,
      organizationRelationship: org.relationship_type,
    })
    await supabase.from('guest_identities').update({ external_type: result.external_type, classification_evidence: result.evidence }).eq('id', g.id)
  }
}

export async function updateOrganization(input: {
  organizationId: string
  name: string
  relationshipType: RelationshipType
  approvalState: ApprovalState
  businessOwner?: string
  businessOwnerEmail?: string
  reviewDate?: string
  notes?: string
  reason?: string
}): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'domain.classify')
    const supabase = db()
    const { data: prev } = await supabase.from('external_organizations').select('*').eq('tenant_id', tenant.id).eq('id', input.organizationId).single()
    if (!prev) return { ok: false, error: 'Organization not found' }
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Name is required' }

    await supabase
      .from('external_organizations')
      .update({
        name,
        relationship_type: input.relationshipType,
        approval_state: input.approvalState,
        business_owner: input.businessOwner?.trim() || null,
        business_owner_email: input.businessOwnerEmail?.trim() || null,
        review_date: input.reviewDate || null,
        notes: input.notes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenant.id)
      .eq('id', input.organizationId)

    const relationshipChanged = prev.relationship_type !== input.relationshipType
    if (relationshipChanged || prev.business_owner !== (input.businessOwner?.trim() || null) || prev.review_date !== (input.reviewDate || null)) {
      await supabase
        .from('external_domains')
        .update({ classification: RELATIONSHIP_TO_DOMAIN_CLASS[input.relationshipType], business_owner: input.businessOwner?.trim() || null, review_date: input.reviewDate || null })
        .eq('tenant_id', tenant.id)
        .eq('organization_id', input.organizationId)
    }

    await audit(session, {
      action: 'organization.updated',
      targetType: 'external_organization',
      targetId: input.organizationId,
      targetLabel: name,
      previousState: { name: prev.name, relationship_type: prev.relationship_type, approval_state: prev.approval_state, business_owner: prev.business_owner, review_date: prev.review_date },
      newState: { name, relationship_type: input.relationshipType, approval_state: input.approvalState, business_owner: input.businessOwner, review_date: input.reviewDate },
      reason: input.reason,
    })

    if (relationshipChanged) {
      await reclassifyOrganization(tenant.id, { id: input.organizationId, relationship_type: input.relationshipType }, tenant.verified_domains ?? [])
      await rescoreTenant(tenant.id, null)
    }
    revalidateOrganizationViews(input.organizationId)
    return { ok: true, message: `${name} updated` }
  } catch (err) {
    return fail(err)
  }
}

/**
 * Apply a relationship, approval state, and/or owner to many organizations at once.
 * Fields left undefined are untouched. Mirrors updateOrganization per row, but rescores once.
 */
export async function bulkUpdateOrganizations(input: {
  organizationIds: string[]
  relationshipType?: RelationshipType
  approvalState?: ApprovalState
  businessOwner?: string
  businessOwnerEmail?: string
  reviewDate?: string
  reason?: string
}): Promise<ActionResult & { updated?: number }> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'domain.classify')
    const ids = Array.from(new Set(input.organizationIds)).filter(Boolean)
    if (ids.length === 0) return { ok: false, error: 'Select at least one organization.' }
    const owner = input.businessOwner?.trim()
    const ownerEmail = input.businessOwnerEmail?.trim()
    if (!input.relationshipType && !input.approvalState && !owner && !ownerEmail && !input.reviewDate) return { ok: false, error: 'Choose a relationship, approval state, or owner to apply.' }

    const supabase = db()
    const { data: rows } = await supabase.from('external_organizations').select('*').eq('tenant_id', tenant.id).in('id', ids)
    if (!rows?.length) return { ok: false, error: 'No matching organizations found.' }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.relationshipType) patch.relationship_type = input.relationshipType
    if (input.approvalState) patch.approval_state = input.approvalState
    if (owner) patch.business_owner = owner
    if (ownerEmail) patch.business_owner_email = ownerEmail
    if (input.reviewDate) patch.review_date = input.reviewDate
    const orgIds = rows.map((r) => r.id as string)
    await supabase.from('external_organizations').update(patch).eq('tenant_id', tenant.id).in('id', orgIds)

    const domainPatch: Record<string, unknown> = {}
    if (input.relationshipType) domainPatch.classification = RELATIONSHIP_TO_DOMAIN_CLASS[input.relationshipType]
    if (owner) domainPatch.business_owner = owner
    if (input.reviewDate) domainPatch.review_date = input.reviewDate
    if (Object.keys(domainPatch).length) await supabase.from('external_domains').update(domainPatch).eq('tenant_id', tenant.id).in('organization_id', orgIds)

    const correlationId = `bulk-${Date.now().toString(36)}`
    for (const prev of rows as ExternalOrganization[]) {
      await audit(session, {
        action: 'organization.updated',
        targetType: 'external_organization',
        targetId: prev.id,
        targetLabel: prev.name,
        previousState: { relationship_type: prev.relationship_type, approval_state: prev.approval_state, business_owner: prev.business_owner, review_date: prev.review_date },
        newState: {
          relationship_type: input.relationshipType ?? prev.relationship_type,
          approval_state: input.approvalState ?? prev.approval_state,
          business_owner: owner ?? prev.business_owner,
          review_date: input.reviewDate ?? prev.review_date,
          bulk: rows.length,
        },
        reason: input.reason,
        correlationId,
      })
    }

    const changedRelationship = input.relationshipType ? (rows as ExternalOrganization[]).filter((r) => r.relationship_type !== input.relationshipType) : []
    for (const org of changedRelationship) await reclassifyOrganization(tenant.id, { id: org.id, relationship_type: input.relationshipType! }, tenant.verified_domains ?? [])
    if (changedRelationship.length) await rescoreTenant(tenant.id, null)

    revalidateOrganizationViews()
    for (const id of orgIds) revalidatePath(`/organizations/${id}`)
    const what = [input.relationshipType && `relationship set to ${RELATIONSHIP_TO_DOMAIN_CLASS[input.relationshipType] === 'approved_partner' ? 'partner' : input.relationshipType}`, input.approvalState && `marked ${input.approvalState}`, owner && `owner set to ${owner}`].filter(Boolean).join(', ')
    return { ok: true, updated: rows.length, message: `${rows.length} organization${rows.length === 1 ? '' : 's'} ${what}` }
  } catch (err) {
    return fail(err)
  }
}

export async function assignDomainToOrganization(input: { domainId: string; organizationId: string | null; newOrganizationName?: string; reason?: string }): Promise<ActionResult> {
  try {
    const { session, tenant } = await requireContext()
    assertCan(session, 'domain.classify')
    const supabase = db()
    const { data: domain } = await supabase.from('external_domains').select('*').eq('tenant_id', tenant.id).eq('id', input.domainId).single()
    if (!domain) return { ok: false, error: 'Domain not found' }

    let targetId = input.organizationId
    if (!targetId) {
      const name = input.newOrganizationName?.trim()
      if (!name) return { ok: false, error: 'Choose an organization or enter a name for a new one' }
      const { data: created, error } = await supabase
        .from('external_organizations')
        .insert({ tenant_id: tenant.id, name, relationship_type: domain.classification === 'approved_partner' ? 'partner' : domain.classification, business_owner: domain.business_owner, review_date: domain.review_date })
        .select('id')
        .single()
      if (error || !created) return { ok: false, error: error?.message ?? 'Could not create organization' }
      targetId = created.id as string
      await audit(session, { action: 'organization.created', targetType: 'external_organization', targetId, targetLabel: name, newState: { name, from_domain: domain.domain } })
    }

    const { data: target } = await supabase.from('external_organizations').select('id,name,relationship_type').eq('tenant_id', tenant.id).eq('id', targetId).single()
    if (!target) return { ok: false, error: 'Organization not found' }

    await supabase.from('external_domains').update({ organization_id: targetId }).eq('tenant_id', tenant.id).eq('id', input.domainId)
    await supabase.from('guest_identities').update({ external_organization_id: targetId }).eq('tenant_id', tenant.id).eq('external_domain_id', input.domainId)

    await audit(session, {
      action: 'domain.reassigned',
      targetType: 'external_domain',
      targetId: input.domainId,
      targetLabel: domain.domain,
      previousState: { organization_id: domain.organization_id },
      newState: { organization_id: targetId, organization_name: target.name },
      reason: input.reason,
    })

    await reclassifyOrganization(tenant.id, target as Pick<ExternalOrganization, 'id' | 'relationship_type'>, tenant.verified_domains ?? [])
    // The previous organization may now be empty; leave it in place so history is preserved.
    revalidateOrganizationViews(targetId)
    if (domain.organization_id) revalidatePath(`/organizations/${domain.organization_id}`)
    return { ok: true, message: `${domain.domain} now belongs to ${target.name}` }
  } catch (err) {
    return fail(err)
  }
}
