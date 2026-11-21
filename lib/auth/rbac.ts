export type RoleKey = 'global_admin' | 'gs_admin' | 'security_analyst' | 'auditor' | 'read_only'

export type Permission =
  | 'view'
  | 'export'
  | 'audit.view'
  | 'scan.run'
  | 'review.create'
  | 'review.decide'
  | 'remediation.request'
  | 'remediation.execute'
  | 'domain.classify'
  | 'policy.manage'
  | 'settings.manage'
  | 'admin.manage'
  | 'billing.manage'
  | 'identity.merge'

const MATRIX: Record<RoleKey, Permission[]> = {
  global_admin: [
    'view', 'export', 'audit.view', 'scan.run', 'review.create', 'review.decide', 'remediation.request', 'remediation.execute',
    'domain.classify', 'policy.manage', 'settings.manage', 'admin.manage', 'billing.manage', 'identity.merge',
  ],
  gs_admin: [
    'view', 'export', 'audit.view', 'scan.run', 'review.create', 'review.decide', 'remediation.request', 'remediation.execute',
    'domain.classify', 'policy.manage', 'settings.manage', 'admin.manage', 'identity.merge',
  ],
  security_analyst: ['view', 'export', 'audit.view', 'scan.run', 'review.create', 'review.decide', 'remediation.request', 'domain.classify'],
  auditor: ['view', 'export', 'audit.view'],
  read_only: ['view'],
}

export const ROLE_KEYS: RoleKey[] = ['global_admin', 'gs_admin', 'security_analyst', 'auditor', 'read_only']

export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === 'string' && ROLE_KEYS.includes(value as RoleKey)
}

/**
 * JWT role is a 12h cache. Demo keeps the picker role because the demo
 * sign-in does not update administrators. Live tenants reload from
 * administrators.role_key and fail closed when that row is missing.
 */
export function resolveLiveRole(
  session: { role: RoleKey; demo: boolean },
  adminRole: unknown,
): RoleKey {
  if (session.demo) return session.role
  if (!isRoleKey(adminRole)) {
    throw new Error('fail closed: administrator row missing')
  }
  return adminRole
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  global_admin: 'Global Administrator',
  gs_admin: 'AIGIS Administrator',
  security_analyst: 'Security Analyst',
  auditor: 'Auditor',
  read_only: 'Read Only',
}

export function can(role: RoleKey, permission: Permission) {
  return MATRIX[role]?.includes(permission) ?? false
}

export function canViewPrivilegedSummary(role: RoleKey) {
  return can(role, 'view')
}

export function canViewPrivilegedDetail(role: RoleKey) {
  return can(role, 'audit.view')
}

export function requirePrivilegedDetail(role: RoleKey) {
  if (!canViewPrivilegedDetail(role)) {
    throw new Error('forbidden: privileged detail requires audit.view')
  }
}

export function canExportPrivileged(role: RoleKey) {
  return can(role, 'export') && can(role, 'audit.view')
}

export function canRequestPrivilegedChange(role: RoleKey) {
  return can(role, 'remediation.request') && can(role, 'audit.view')
}

export function canApprovePrivilegedChange(
  role: RoleKey,
  opts: { userId: string; requesterId: string | null; alreadyApproved: boolean },
) {
  if (!can(role, 'remediation.execute')) return false
  if (opts.alreadyApproved) return false
  if (opts.requesterId && opts.userId === opts.requesterId) return false
  return true
}

export function canMarkPrivilegedChange(role: RoleKey) {
  return can(role, 'remediation.execute')
}

export function canStartPrivilegedReview(role: RoleKey) {
  return can(role, 'review.create') && can(role, 'audit.view')
}

export function canDecidePrivilegedReview(role: RoleKey) {
  return can(role, 'review.decide') && can(role, 'audit.view')
}
