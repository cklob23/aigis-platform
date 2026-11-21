export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type RecommendedAction = 'keep' | 'review' | 'remove_selected' | 'disable' | 'remove'
/** Per-assignment overlay recommendation. Computed in TS; `role_assignments` has no column in this PR. */
export type AssignmentRecommendedChange =
  | 'convert_to_eligible'
  | 'remove_assignment'
  | 'move_to_dedicated_admin'
  | 'reduce_scope'
export type ReviewStatus = 'never_reviewed' | 'pending' | 'approved' | 'removed' | 'extended' | 'investigating'
export type DomainClassification =
  | 'approved_partner'
  | 'vendor'
  | 'contractor'
  | 'client'
  | 'temporary'
  | 'unknown'
  | 'blocked'
export type ResourceType = 'team' | 'm365_group' | 'sharepoint_site' | 'enterprise_app' | 'security_group'
export type SensitivityCategory = 'finance' | 'hr' | 'clinical' | 'executive' | 'legal' | 'rnd' | 'other'

export type RiskFactor = {
  key: string
  label: string
  points: number
  detail?: string
}

export type Guest = {
  id: string
  tenant_id: string
  identity_id: string
  ms_object_id: string
  display_name: string | null
  email: string | null
  upn: string | null
  domain: string | null
  external_domain_id: string | null
  company_name: string | null
  company_source: 'graph' | 'domain' | null
  account_enabled: boolean
  invitation_status: string | null
  user_type: string
  created_at_ms: string | null
  last_sign_in_at: string | null
  last_non_interactive_sign_in_at: string | null
  auth_methods: string[]
  sponsor_ms_object_id: string | null
  sponsor_display_name: string | null
  sponsor_email: string | null
  sponsor_enabled: boolean | null
  identity_class: IdentityClass
  external_type: ExternalIdentityType
  classification_evidence: ClassificationEvidence[]
  external_organization_id: string | null
  risk_score: number
  risk_level: RiskLevel
  risk_factors: RiskFactor[]
  recommended_action: RecommendedAction
  review_status: ReviewStatus
  last_reviewed_at: string | null
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

/** Reusable alias: the Guest row is the external-identity extension of the identity model. */
export type ExternalIdentity = Guest

export type Resource = {
  id: string
  tenant_id: string
  ms_object_id: string
  resource_type: ResourceType
  display_name: string
  description: string | null
  visibility: string | null
  web_url: string | null
  mail: string | null
  is_sensitive: boolean
  sensitivity_category: SensitivityCategory | null
  internal_member_count: number
  external_member_count: number
  owners: { id: string; displayName: string; mail?: string }[]
  linked_resource_id: string | null
  metadata: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

export type ExternalDomain = {
  id: string
  tenant_id: string
  domain: string
  classification: DomainClassification
  organization_id: string | null
  business_owner: string | null
  review_date: string | null
  notes: string | null
  first_seen_at: string
  last_seen_at: string
}

// ---------------------------------------------------------------------------
// External Identity Governance abstractions (Phase 1)
// ---------------------------------------------------------------------------

/** Top-level identity taxonomy. `external` is always populated; `human_internal` is scoped role holders, guest sponsors, and role-holder managers when the privileged module is on. `group` is a privileged-only class (no SQL in PR 6). */
export type IdentityClass = 'human_internal' | 'external' | 'privileged' | 'non_human' | 'group' | 'agent'
export type IdentityStatus = 'active' | 'disabled' | 'removed'
export type IdentityOwnerKind = 'sponsor' | 'assigned' | 'inferred' | 'none'
export type IdentityAccountSource = 'entra'
export type IdentityAccountKind = 'user' | 'guest' | 'sp' | 'workload' | 'agent'
export type IdentityRelationType = 'owns' | 'sponsors' | 'same_as' | 'created_by'

/** AI recommend/explain is on-demand and off by default. No autonomous writes. */
export type AiSettings = { enabled: boolean; mode: 'on_demand' }
export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: false, mode: 'on_demand' }

export type PrivilegedPimStatus = 'available' | 'unavailable' | 'needs_consent' | 'unknown'
export type PrivilegedLicenseHint = 'p2' | 'p1' | 'governance' | 'none'

export type PrivilegedCapability = {
  pim: PrivilegedPimStatus
  pim_groups: PrivilegedPimStatus
  sign_in_activity: boolean
  auth_methods: boolean
  license_hint: PrivilegedLicenseHint
  checked_at: string
  scan_job_id: string | null
}

export type PrivilegedSettings = {
  enabled: boolean
  capability: PrivilegedCapability | null
  /** App-only roles cached on enable/recheck. Settings page does not call Graph on every load. */
  granted_permissions: string[]
}

export const DEFAULT_PRIVILEGED_SETTINGS: PrivilegedSettings = { enabled: false, capability: null, granted_permissions: [] }

export type Identity = {
  id: string
  tenant_id: string
  identity_class: IdentityClass
  display_name: string | null
  primary_email: string | null
  status: IdentityStatus
  risk_score: number
  risk_level: RiskLevel
  recommended_action: RecommendedAction
  review_status: ReviewStatus
  last_reviewed_at: string | null
  owner_identity_id: string | null
  owner_kind: IdentityOwnerKind
  owner_email: string | null
  owner_ms_object_id: string | null
  owner_display_name: string | null
  last_activity_at: string | null
  is_privileged: boolean
  privilege_tier: 0 | 1 | 2 | null
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

export type DirectoryRole = {
  id: string
  tenant_id: string
  ms_role_id: string
  template_id: string | null
  display_name: string
  description: string | null
  is_built_in: boolean
  ms_is_privileged: boolean
  is_privileged: boolean
  privilege_tier: 0 | 1 | 2 | null
  tier_rule: 't0_fixed' | 't2_reader' | 'default_t1' | 'custom_default' | 'excluded'
  tier_map_version: string
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

export type RoleAssignment = {
  id: string
  tenant_id: string
  ms_assignment_id: string
  directory_role_id: string
  principal_identity_id: string | null
  principal_ms_object_id: string
  directory_scope_id: string
  assignment_type: 'active' | 'eligible'
  member_type: 'direct' | 'group' | 'inherited'
  pim_status: string | null
  starts_at: string | null
  ends_at: string | null
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
  /** Overlay-only. Not stored on `role_assignments` until a later SQL migration. */
  recommended_change?: AssignmentRecommendedChange | null
}

export type GroupPimEligibility = {
  id: string
  tenant_id: string
  ms_schedule_id: string
  group_ms_object_id: string
  principal_identity_id: string | null
  principal_ms_object_id: string
  access_id: 'member' | 'owner'
  member_type: 'direct' | 'group' | 'inherited'
  pim_status: string | null
  starts_at: string | null
  ends_at: string | null
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

export type IdentityAccount = {
  id: string
  identity_id: string
  tenant_id: string
  source: IdentityAccountSource | string
  source_object_id: string
  account_kind: IdentityAccountKind
  upn: string | null
  enabled: boolean
  last_activity_at: string | null
  attrs: Record<string, unknown>
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

export type IdentityRelation = {
  id: string
  tenant_id: string
  from_identity_id: string
  to_identity_id: string
  relation_type: IdentityRelationType
  confidence: number | null
  evidence: Record<string, unknown>
  created_at: string
}

/** How an external identity relates to the tenant, inferred from Graph signals and organization context. */
export type ExternalIdentityType = 'b2b_guest' | 'external_member' | 'cross_tenant' | 'contractor' | 'partner' | 'vendor' | 'client' | 'unknown'

export const EXTERNAL_TYPE_LABELS: Record<ExternalIdentityType, string> = {
  b2b_guest: 'B2B guest',
  external_member: 'External member',
  cross_tenant: 'Cross-tenant',
  contractor: 'Contractor',
  partner: 'Partner',
  vendor: 'Vendor',
  client: 'Client',
  unknown: 'Unclassified',
}

/** A single piece of evidence that contributed to an identity's classification. */
export type ClassificationEvidence = {
  signal: string
  value: string | null
  weight: number
  explanation: string
}

export type RelationshipType = 'partner' | 'vendor' | 'contractor' | 'client' | 'temporary' | 'unknown' | 'former' | 'blocked'
export type ApprovalState = 'unreviewed' | 'approved' | 'restricted' | 'blocked'

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  partner: 'Partner',
  vendor: 'Vendor',
  contractor: 'Contractor',
  client: 'Client',
  temporary: 'Temporary',
  unknown: 'Unknown',
  former: 'Former relationship',
  blocked: 'Blocked',
}

export const APPROVAL_LABELS: Record<ApprovalState, string> = {
  unreviewed: 'Unreviewed',
  approved: 'Approved',
  restricted: 'Restricted',
  blocked: 'Blocked',
}

export type ExternalOrganization = {
  id: string
  tenant_id: string
  name: string
  relationship_type: RelationshipType
  approval_state: ApprovalState
  business_owner: string | null
  business_owner_email: string | null
  review_date: string | null
  risk_level: RiskLevel
  notes: string | null
  seed_domain_id: string | null
  first_seen_at: string
  last_seen_at: string
  created_at: string
  updated_at: string
}

export type Membership = {
  id: string
  guest_id: string
  identity_id: string | null
  account_id: string | null
  resource_id: string
  membership_type: 'member' | 'owner'
  first_seen_at: string
  last_seen_at: string
  removed_at: string | null
}

export type ScanJob = {
  id: string
  tenant_id: string
  scan_type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: { phase?: string; percent?: number; message?: string; phases?: Record<string, 'pending' | 'running' | 'done' | 'error'> }
  started_at: string | null
  completed_at: string | null
  error: string | null
  summary: Record<string, number>
  created_at: string
}

export type ReviewApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected'

export type AccessReview = {
  id: string
  tenant_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  scope: Record<string, unknown>
  created_by: string | null
  created_by_email: string | null
  due_at: string | null
  created_at: string
  completed_at: string | null
  approval_status: ReviewApprovalStatus
  approval_requested_at: string | null
  approved_by: string | null
  approved_by_email: string | null
  approved_at: string | null
  approval_note: string | null
  reviewer_emails: string[]
  reviewers_notified_at: string | null
  last_reminder_at: string | null
}

export type ReviewScopeKind = 'selected' | 'high_critical' | 'all_external'
export type ReviewReviewerKind = 'sponsor' | 'resource_owner' | 'admin'
export type ReviewRecurrence = 'once' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'
export type ReviewNoResponseAction = 'keep' | 'recommendation' | 'remove'

export const REVIEW_SCOPE_LABELS: Record<ReviewScopeKind, { label: string; description: string }> = {
  selected: { label: 'Selected guests', description: 'Only the identities you ticked on External identities.' },
  high_critical: { label: 'All high and critical', description: 'Every active external identity currently scored high or critical.' },
  all_external: { label: 'All external identities', description: 'Every active external identity in the tenant. Use for a periodic full certification.' },
}
export const REVIEW_REVIEWER_LABELS: Record<ReviewReviewerKind, { label: string; description: string }> = {
  sponsor: { label: 'Sponsor', description: 'The internal user who invited or owns the relationship. Falls back to the default reviewers when no sponsor is set.' },
  resource_owner: { label: 'Resource owner', description: 'Owners of the groups, sites and apps each guest can reach.' },
  admin: { label: 'AIGIS administrator', description: 'An administrator decides centrally. Useful when sponsors are missing or disabled.' },
}
export const REVIEW_RECURRENCE_LABELS: Record<ReviewRecurrence, string> = { once: 'One-time', monthly: 'Monthly', quarterly: 'Quarterly', semiannual: 'Every 6 months', annual: 'Annual' }
export const REVIEW_NO_RESPONSE_LABELS: Record<ReviewNoResponseAction, { label: string; description: string }> = {
  keep: { label: 'Keep access', description: 'Undecided items stay as they are. Nothing changes in Entra.' },
  recommendation: { label: 'Take AIGIS recommendation', description: 'Undecided items adopt the per-guest recommendation (keep, trim, remove) as the recorded outcome.' },
  remove: { label: 'Remove access', description: 'Undecided items are recorded as remove and queued for remediation approval.' },
}

export type AlertTriggerType =
  | 'new_external_identity'
  | 'risk_level'
  | 'unapproved_organization'
  | 'sensitive_access'
  | 'inactive_identity'
  | 'review_overdue'
  | 'scan_failed'
  | 'new_tier0_assignment'
  | 'guest_with_role'
  | 'dormant_admin'
  | 'privileged_not_reviewed'
  | 'privileged_change_not_seen'

export const ALERT_TRIGGER_LABELS: Record<AlertTriggerType, { label: string; description: string }> = {
  new_external_identity: { label: 'New external identity', description: 'An external identity appeared in the tenant for the first time.' },
  risk_level: { label: 'Risk level reached', description: 'An identity is scored at or above a chosen risk level.' },
  unapproved_organization: { label: 'Unapproved organization has access', description: 'An identity from an unreviewed, restricted or blocked organization holds access.' },
  sensitive_access: { label: 'Access to sensitive resource', description: 'An external identity is a member of a resource tagged sensitive.' },
  inactive_identity: { label: 'Inactive identity', description: 'No sign-in for more than a chosen number of days while access remains.' },
  review_overdue: { label: 'Access review overdue', description: 'An active review passed its due date with pending decisions.' },
  scan_failed: { label: 'Scan failed', description: 'A scheduled or manual scan ended with an error.' },
  new_tier0_assignment: { label: 'New Tier 0 role assignment', description: 'Someone was given a Tier 0 role since the last scan.' },
  guest_with_role: { label: 'External identity with an admin role', description: 'An external identity holds a privileged directory role (any tier).' },
  dormant_admin: { label: 'Dormant privileged account', description: "Holds a privileged role and hasn't signed in for 90 days." },
  privileged_not_reviewed: { label: 'Privileged access overdue for review', description: 'Not reviewed in the last 90 days.' },
  privileged_change_not_seen: { label: 'Approved change not seen on scan', description: "A change marked as made in Microsoft wasn't detected on the next scan." },
}

export type AlertRuleConditions = {
  min_risk_level?: RiskLevel
  inactive_days?: number
  approval_states?: ApprovalState[]
  sensitive_only?: boolean
}

export type AlertRule = {
  id: string
  tenant_id: string
  name: string
  description: string | null
  trigger_type: AlertTriggerType
  conditions: AlertRuleConditions
  severity: RiskLevel
  recipients: string[]
  notify_email: boolean
  enabled: boolean
  created_by: string | null
  last_fired_at: string | null
  created_at: string
  updated_at: string
}

export type EmailLogEntry = {
  id: string
  tenant_id: string
  kind: string
  recipients: string[]
  subject: string
  status: 'sent' | 'failed' | 'skipped'
  error: string | null
  sender: string | null
  related_type: string | null
  related_id: string | null
  created_at: string
}

export type ReviewWorkflowSettings = {
  require_approval: boolean
  approver_emails: string[]
  default_reviewer_emails: string[]
  notify_reviewers: boolean
  notify_sponsors: boolean
  reminder_days_before_due: number
  default_due_days: number
}

export const DEFAULT_REVIEW_WORKFLOW: ReviewWorkflowSettings = {
  require_approval: false,
  approver_emails: [],
  default_reviewer_emails: [],
  notify_reviewers: true,
  notify_sponsors: false,
  reminder_days_before_due: 3,
  default_due_days: 14,
}

export type EmailSettings = {
  sender_upn: string | null
  reply_to: string | null
}

export type ReviewItemSubjectKind = 'identity' | 'role_assignment'

export type ReviewItem = {
  id: string
  review_id: string
  guest_id: string | null
  identity_id: string | null
  subject_kind: ReviewItemSubjectKind
  role_assignment_id: string | null
  status: 'pending' | 'decided' | 'actioned'
  decision: 'approve' | 'remove' | 'extend' | 'investigate' | null
  final_action: string | null
  resources_snapshot: { id: string; name: string; type: ResourceType; sensitive: boolean }[]
  decided_at: string | null
}

export type AuditEvent = {
  id: string
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  target_label: string | null
  previous_state: unknown
  new_state: unknown
  reason: string | null
  source_ip: string | null
  correlation_id: string | null
  created_at: string
}

export type Finding = {
  id: string
  guest_id: string | null
  identity_id: string | null
  resource_id: string | null
  external_domain_id: string | null
  severity: RiskLevel
  finding_type: string
  title: string
  description: string | null
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
}

export const RISK_LEVEL_ORDER: RiskLevel[] = ['critical', 'high', 'medium', 'low']

export const DOMAIN_CLASSIFICATION_LABELS: Record<DomainClassification, string> = {
  approved_partner: 'Approved partner',
  vendor: 'Vendor',
  contractor: 'Contractor',
  client: 'Client',
  temporary: 'Temporary',
  unknown: 'Unknown',
  blocked: 'Blocked',
}

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  team: 'Team',
  m365_group: 'Microsoft 365 Group',
  sharepoint_site: 'SharePoint site',
  enterprise_app: 'Enterprise app',
  security_group: 'Security group',
}

export const SENSITIVITY_LABELS: Record<SensitivityCategory, string> = {
  finance: 'Finance',
  hr: 'HR',
  clinical: 'Clinical',
  executive: 'Executive',
  legal: 'Legal',
  rnd: 'R&D',
  other: 'Other',
}
