export type RoleKey = 'global_admin' | 'gs_admin' | 'security_analyst' | 'auditor' | 'read_only'

export type Permission =
  | 'view'
  | 'export'
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

const MATRIX: Record<RoleKey, Permission[]> = {
  global_admin: [
    'view', 'export', 'scan.run', 'review.create', 'review.decide', 'remediation.request', 'remediation.execute',
    'domain.classify', 'policy.manage', 'settings.manage', 'admin.manage', 'billing.manage',
  ],
  gs_admin: [
    'view', 'export', 'scan.run', 'review.create', 'review.decide', 'remediation.request', 'remediation.execute',
    'domain.classify', 'policy.manage', 'settings.manage', 'admin.manage',
  ],
  security_analyst: ['view', 'export', 'scan.run', 'review.create', 'review.decide', 'remediation.request', 'domain.classify'],
  auditor: ['view', 'export'],
  read_only: ['view'],
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
