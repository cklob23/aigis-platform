import { describe, expect, it } from 'vitest'
import { loginNextParam, safeAppPath } from '@/lib/auth/next-path'

describe('loginNextParam', () => {
  it('keeps the query string', () => {
    expect(loginNextParam('/privileged', '?tab=roles')).toBe('/privileged?tab=roles')
    expect(loginNextParam('/privileged', '')).toBe('/privileged')
  })
})

describe('safeAppPath', () => {
  it('allows in-app paths with query and rejects open redirects', () => {
    expect(safeAppPath('/privileged?tab=roles')).toBe('/privileged?tab=roles')
    expect(safeAppPath('/dashboard')).toBe('/dashboard')
    expect(safeAppPath('https://evil.example/phish')).toBeNull()
    expect(safeAppPath('//evil.example')).toBeNull()
    expect(safeAppPath('/auth/login')).toBeNull()
    expect(safeAppPath('/api/export')).toBeNull()
  })
})
