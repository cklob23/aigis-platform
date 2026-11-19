import { describe, expect, it } from 'vitest'
import { can, resolveLiveRole, type RoleKey } from '@/lib/auth/rbac'

const ROLES: RoleKey[] = ['global_admin', 'gs_admin', 'security_analyst', 'auditor', 'read_only']

describe('RBAC matrix', () => {
  it('grants audit.view to auditor and above, not read_only', () => {
    expect(can('read_only', 'audit.view')).toBe(false)
    for (const role of ['auditor', 'security_analyst', 'gs_admin', 'global_admin'] as RoleKey[]) {
      expect(can(role, 'audit.view')).toBe(true)
    }
  })

  it('reserves identity.merge for gs_admin and global_admin', () => {
    expect(can('gs_admin', 'identity.merge')).toBe(true)
    expect(can('global_admin', 'identity.merge')).toBe(true)
    for (const role of ['security_analyst', 'auditor', 'read_only'] as RoleKey[]) {
      expect(can(role, 'identity.merge')).toBe(false)
    }
  })

  it('keeps analyst from executing remediation and auditor from remediating', () => {
    expect(can('security_analyst', 'remediation.execute')).toBe(false)
    expect(can('security_analyst', 'remediation.request')).toBe(true)
    expect(can('auditor', 'remediation.request')).toBe(false)
    expect(can('auditor', 'remediation.execute')).toBe(false)
  })

  it('reserves settings.manage for Global Admin and AIGIS Admin', () => {
    expect(can('global_admin', 'settings.manage')).toBe(true)
    expect(can('gs_admin', 'settings.manage')).toBe(true)
    for (const role of ['security_analyst', 'auditor', 'read_only'] as RoleKey[]) {
      expect(can(role, 'settings.manage')).toBe(false)
    }
  })
})

describe('resolveLiveRole', () => {
  it('keeps the JWT role for demo sessions even when administrators differ', () => {
    expect(resolveLiveRole({ role: 'auditor', demo: true }, 'gs_admin')).toBe('auditor')
    expect(resolveLiveRole({ role: 'read_only', demo: true }, null)).toBe('read_only')
  })

  it('reloads administrators.role_key for live tenants without waiting for JWT expiry', () => {
    expect(resolveLiveRole({ role: 'gs_admin', demo: false }, 'security_analyst')).toBe('security_analyst')
  })

  it('fails closed when the live administrator row is missing or unknown', () => {
    expect(() => resolveLiveRole({ role: 'gs_admin', demo: false }, null)).toThrow(/administrator row missing/)
    expect(() => resolveLiveRole({ role: 'gs_admin', demo: false }, 'msp')).toThrow(/administrator row missing/)
  })

  it('covers every role key as a live reload source', () => {
    for (const role of ROLES) {
      expect(resolveLiveRole({ role: 'read_only', demo: false }, role)).toBe(role)
    }
  })
})
