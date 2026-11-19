import { describe, expect, it } from 'vitest'
import {
  GRAPH_WRITE_PERMISSIONS,
  LIVE_ENTRA_WRITES_DISABLED,
  REQUESTED_APPLICATION_PERMISSIONS,
  canExecuteEntraWrites,
} from '@/lib/remediation/entra-writes'

describe('canExecuteEntraWrites', () => {
  it('allows demo simulation only', () => {
    expect(canExecuteEntraWrites({ is_demo: true })).toBe(true)
    expect(canExecuteEntraWrites({ is_demo: false })).toBe(false)
  })

  it('does not treat a stored enforce setting as permission to write Graph', () => {
    expect(canExecuteEntraWrites({ is_demo: false })).toBe(false)
  })
})

describe('requested vs write scopes', () => {
  it('lists only read application permissions at consent', () => {
    expect(REQUESTED_APPLICATION_PERMISSIONS.every((scope) => scope.endsWith('.Read.All'))).toBe(true)
    expect(REQUESTED_APPLICATION_PERMISSIONS).not.toContain('User.ReadWrite.All')
    expect(REQUESTED_APPLICATION_PERMISSIONS).not.toContain('GroupMember.ReadWrite.All')
  })

  it('names the write permissions each action would need, none of which are requested', () => {
    const needed = new Set(Object.values(GRAPH_WRITE_PERMISSIONS).flat())
    for (const scope of needed) {
      expect(REQUESTED_APPLICATION_PERMISSIONS).not.toContain(scope)
    }
    expect(GRAPH_WRITE_PERMISSIONS.disable_guest).toContain('User.ReadWrite.All')
    expect(GRAPH_WRITE_PERMISSIONS.remove_from_resources).toContain('GroupMember.ReadWrite.All')
    expect(GRAPH_WRITE_PERMISSIONS.delete_guest).toContain('User.ReadWrite.All')
  })

  it('has a clear live-tenant message', () => {
    expect(LIVE_ENTRA_WRITES_DISABLED).toMatch(/does not request Graph write permissions/)
  })
})
