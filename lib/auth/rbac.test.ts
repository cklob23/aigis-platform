import { describe, expect, it } from 'vitest'
import {
  can,
  canApprovePrivilegedChange,
  canDecidePrivilegedReview,
  canExportPrivileged,
  canMarkPrivilegedChange,
  canRequestPrivilegedChange,
  canStartPrivilegedReview,
  canViewPrivilegedDetail,
  canViewPrivilegedSummary,
  requirePrivilegedDetail,
  resolveLiveRole,
  type RoleKey,
} from '@/lib/auth/rbac'

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

describe('privileged RBAC helpers', () => {
  it('grants summary to every role and detail to everyone except read_only', () => {
    for (const role of ROLES) {
      expect(canViewPrivilegedSummary(role)).toBe(true)
    }
    expect(canViewPrivilegedDetail('read_only')).toBe(false)
    expect(canExportPrivileged('read_only')).toBe(false)
    expect(canRequestPrivilegedChange('read_only')).toBe(false)
    expect(canApprovePrivilegedChange('read_only', { userId: 'u1', requesterId: 'u2', alreadyApproved: false })).toBe(false)
    expect(canMarkPrivilegedChange('read_only')).toBe(false)
    expect(canStartPrivilegedReview('read_only')).toBe(false)
    expect(canDecidePrivilegedReview('read_only')).toBe(false)
    expect(() => requirePrivilegedDetail('read_only')).toThrow(/audit\.view/)
    for (const role of ['auditor', 'security_analyst', 'gs_admin', 'global_admin'] as RoleKey[]) {
      expect(canViewPrivilegedDetail(role)).toBe(true)
      expect(canExportPrivileged(role)).toBe(true)
      expect(() => requirePrivilegedDetail(role)).not.toThrow()
    }
  })

  it('keeps request/approve/mark/review helpers on the existing matrix', () => {
    expect(canRequestPrivilegedChange('security_analyst')).toBe(true)
    expect(canApprovePrivilegedChange('security_analyst', { userId: 'u1', requesterId: 'u2', alreadyApproved: false })).toBe(false)
    expect(canMarkPrivilegedChange('security_analyst')).toBe(false)
    expect(canStartPrivilegedReview('security_analyst')).toBe(true)
    expect(canDecidePrivilegedReview('security_analyst')).toBe(true)
    expect(canApprovePrivilegedChange('gs_admin', { userId: 'u1', requesterId: 'u1', alreadyApproved: false })).toBe(false)
    expect(canApprovePrivilegedChange('gs_admin', { userId: 'u1', requesterId: 'u2', alreadyApproved: true })).toBe(false)
    expect(canApprovePrivilegedChange('gs_admin', { userId: 'u1', requesterId: 'u2', alreadyApproved: false })).toBe(true)
    expect(canMarkPrivilegedChange('gs_admin')).toBe(true)
    expect(canRequestPrivilegedChange('auditor')).toBe(false)
    expect(canStartPrivilegedReview('auditor')).toBe(false)
    expect(canDecidePrivilegedReview('auditor')).toBe(false)
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
