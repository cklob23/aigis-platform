import { describe, expect, it } from 'vitest'
import { entraAssignedRolesUrl, entraIdentityUrl, entraPimRolesUrl, entraRoleDefinitionUrl, entraServicePrincipalUrl } from '@/lib/privileged/links'

describe('Entra deep links', () => {
  it('builds read-only admin center URLs', () => {
    expect(entraAssignedRolesUrl('user-1')).toContain('AssignedRoles')
    expect(entraAssignedRolesUrl('user-1')).toContain('userId/user-1')
    expect(entraRoleDefinitionUrl('role-template')).toContain('roleId/role-template')
    expect(entraPimRolesUrl()).toContain('PIMCommon')
    expect(entraServicePrincipalUrl('sp-1')).toContain('objectId/sp-1')
    expect(entraIdentityUrl({ objectId: 'u1', identityClass: 'human_internal' })).toContain('AssignedRoles')
    expect(entraIdentityUrl({ objectId: 'sp-1', identityClass: 'non_human' })).toContain('ManagedAppMenuBlade')
  })

  it('does not produce Graph write endpoints', () => {
    const urls = [
      entraAssignedRolesUrl('abc'),
      entraRoleDefinitionUrl('def'),
      entraPimRolesUrl(),
      entraServicePrincipalUrl('ghi'),
    ].join('\n')
    expect(urls).not.toMatch(/graph\.microsoft\.com/i)
    expect(urls).not.toMatch(/\/roleAssignmentScheduleRequests/i)
  })
})
