import type { ClassificationEvidence, ExternalIdentityType, RelationshipType } from '@/lib/types'
import { companyFromDomain, isConsumerEmailDomain } from '@/lib/identity/company'

/**
 * Minimal subset of Graph `user` plus organization context needed to classify an
 * external identity. Kept provider-agnostic so a future IdentityProvider
 * abstraction can feed it from sources other than Microsoft Graph.
 */
export type ClassificationInput = {
  userType: string | null | undefined
  userPrincipalName: string | null | undefined
  mail: string | null | undefined
  externalUserState: string | null | undefined
  companyName: string | null | undefined
  jobTitle?: string | null
  creationType?: string | null
  domain: string | null
  tenantVerifiedDomains: string[]
  organizationRelationship: RelationshipType | null
}

export type ClassificationResult = {
  external_type: ExternalIdentityType
  evidence: ClassificationEvidence[]
}

const CONTRACTOR_HINTS = /\b(contractor|consultant|contingent|temp|freelance|external staff)\b/i
const RELATIONSHIP_TO_TYPE: Partial<Record<RelationshipType, ExternalIdentityType>> = {
  partner: 'partner',
  vendor: 'vendor',
  contractor: 'contractor',
  client: 'client',
}

/**
 * Classify an external identity and explain why. Every returned evidence item
 * is user-facing, so the UI can show "why is this a Contractor?" without
 * re-deriving anything.
 */
export function classifyExternalIdentity(input: ClassificationInput): ClassificationResult {
  const evidence: ClassificationEvidence[] = []
  const scores: Record<ExternalIdentityType, number> = {
    b2b_guest: 0,
    external_member: 0,
    cross_tenant: 0,
    contractor: 0,
    partner: 0,
    vendor: 0,
    client: 0,
    unknown: 0,
  }

  const add = (type: ExternalIdentityType, item: ClassificationEvidence) => {
    scores[type] += item.weight
    evidence.push(item)
  }

  const upn = input.userPrincipalName ?? ''
  const isExtUpn = /#EXT#/i.test(upn)
  const domainIsVerified = Boolean(input.domain && input.tenantVerifiedDomains.includes(input.domain))

  if ((input.userType ?? '').toLowerCase() === 'guest') {
    add('b2b_guest', { signal: 'userType', value: input.userType ?? null, weight: 3, explanation: 'Entra ID marks this account as a Guest user.' })
  } else if ((input.userType ?? '').toLowerCase() === 'member' && isExtUpn) {
    add('external_member', { signal: 'userType', value: input.userType ?? null, weight: 4, explanation: 'Member user type with an #EXT# principal name: an external account promoted to Member.' })
  } else if ((input.userType ?? '').toLowerCase() === 'member' && input.domain && !domainIsVerified) {
    add('external_member', { signal: 'domain', value: input.domain, weight: 3, explanation: 'Member user whose sign-in domain is not one of the tenant\u2019s verified domains.' })
  }

  if (isExtUpn) {
    add('b2b_guest', { signal: 'userPrincipalName', value: '#EXT#', weight: 1, explanation: 'Principal name follows the B2B collaboration pattern.' })
  }

  if (input.externalUserState) {
    add('b2b_guest', { signal: 'externalUserState', value: input.externalUserState, weight: 1, explanation: `B2B invitation state is ${input.externalUserState}.` })
  }

  if (input.creationType === 'Invitation') {
    add('b2b_guest', { signal: 'creationType', value: input.creationType, weight: 1, explanation: 'Account was created through a B2B invitation.' })
  }

  if (input.domain && !domainIsVerified && /\.onmicrosoft\.com$/i.test(input.domain)) {
    add('cross_tenant', { signal: 'domain', value: input.domain, weight: 2, explanation: 'Home domain is another Microsoft 365 tenant\u2019s default domain.' })
  }

  const jobTitle = input.jobTitle ?? ''
  if (CONTRACTOR_HINTS.test(jobTitle)) {
    add('contractor', { signal: 'jobTitle', value: jobTitle, weight: 3, explanation: 'Job title indicates contingent or contract work.' })
  }
  if (CONTRACTOR_HINTS.test(input.companyName ?? '')) {
    add('contractor', { signal: 'companyName', value: input.companyName ?? null, weight: 2, explanation: 'Company name indicates a staffing or contracting arrangement.' })
  }

  if (input.organizationRelationship && RELATIONSHIP_TO_TYPE[input.organizationRelationship]) {
    const type = RELATIONSHIP_TO_TYPE[input.organizationRelationship]!
    // Weighted above the sum of the generic B2B signals so a known business
    // relationship always wins over "B2B guest".
    add(type, { signal: 'organization.relationship_type', value: input.organizationRelationship, weight: 8, explanation: `The owning external organization is classified as ${input.organizationRelationship}.` })
  }

  if (isConsumerEmailDomain(input.domain)) {
    evidence.push({ signal: 'domain', value: input.domain, weight: 0, explanation: 'Personal email provider. No company is inferred from this domain.' })
  } else if (!input.companyName?.trim() && companyFromDomain(input.domain)) {
    evidence.push({ signal: 'domain', value: input.domain, weight: 0, explanation: `Company inferred from the email domain as "${companyFromDomain(input.domain)}".` })
  }
  if (input.companyName && !input.organizationRelationship) {
    evidence.push({ signal: 'companyName', value: input.companyName, weight: 0, explanation: 'Company name is present but the organization has not been classified yet.' })
  }

  const ranked = (Object.entries(scores) as [ExternalIdentityType, number][]).filter(([t]) => t !== 'unknown').sort((a, b) => b[1] - a[1])
  const [best, bestScore] = ranked[0]

  if (bestScore === 0) {
    evidence.push({ signal: 'none', value: null, weight: 0, explanation: 'No classification signals were found for this identity.' })
    return { external_type: 'unknown', evidence }
  }

  // Business relationship beats the generic technical type when both are present:
  // "Vendor" is more useful than "B2B guest" for governance decisions.
  return { external_type: best, evidence: evidence.sort((a, b) => b.weight - a.weight) }
}

/**
 * Default organization name for an auto-created organization: the most common
 * Graph company name, else a name derived from the domain (skipped for consumer
 * mail providers), else the domain itself.
 */
export function defaultOrganizationName(domain: string, companyNames: (string | null | undefined)[]) {
  const counts = new Map<string, number>()
  for (const name of companyNames) {
    const trimmed = name?.trim()
    if (!trimmed) continue
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1)
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? companyFromDomain(domain) ?? domain
}
