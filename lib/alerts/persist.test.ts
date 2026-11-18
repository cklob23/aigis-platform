import { describe, expect, it, vi } from 'vitest'
import { persistNewAlerts, stampAlertEmail } from '@/lib/alerts/persist'

describe('persistNewAlerts', () => {
  it('returns immediately when there are no rows', async () => {
    const db = {
      insertAlerts: vi.fn(async () => ({ error: null, data: [] })),
      touchRule: vi.fn(async () => ({ error: null })),
    }
    await expect(persistNewAlerts(db, { ruleId: 'rule-1', rows: [] })).resolves.toEqual([])
    expect(db.insertAlerts).not.toHaveBeenCalled()
  })

  it('inserts then touches last_fired_at', async () => {
    const db = {
      insertAlerts: vi.fn(async () => ({ error: null, data: [{ id: 'a1' }, { id: 'a2' }] })),
      touchRule: vi.fn(async () => ({ error: null })),
    }
    await expect(persistNewAlerts(db, { ruleId: 'rule-1', rows: [{ title: 'x' }] })).resolves.toEqual(['a1', 'a2'])
    expect(db.touchRule).toHaveBeenCalledWith('rule-1')
  })

  it('does not update last_fired_at when insert fails', async () => {
    const db = {
      insertAlerts: vi.fn(async () => ({ error: { message: 'duplicate dedupe_key' }, data: null })),
      touchRule: vi.fn(async () => ({ error: null })),
    }
    await expect(persistNewAlerts(db, { ruleId: 'rule-1', rows: [{ title: 'x' }] })).rejects.toThrow(
      'alerts insert: duplicate dedupe_key',
    )
    expect(db.touchRule).not.toHaveBeenCalled()
  })

  it('throws when insert returns no rows', async () => {
    const db = {
      insertAlerts: vi.fn(async () => ({ error: null, data: [] })),
      touchRule: vi.fn(async () => ({ error: null })),
    }
    await expect(persistNewAlerts(db, { ruleId: 'rule-1', rows: [{ title: 'x' }] })).rejects.toThrow(
      'alerts insert: no rows returned',
    )
    expect(db.touchRule).not.toHaveBeenCalled()
  })

  it('throws when last_fired_at fails after a successful insert', async () => {
    const db = {
      insertAlerts: vi.fn(async () => ({ error: null, data: [{ id: 'a1' }] })),
      touchRule: vi.fn(async () => ({ error: { message: 'row locked' } })),
    }
    await expect(persistNewAlerts(db, { ruleId: 'rule-1', rows: [{ title: 'x' }] })).rejects.toThrow(
      'alert_rules last_fired_at: row locked',
    )
  })
})

describe('stampAlertEmail', () => {
  it('surfaces a failed email stamp', async () => {
    const db = {
      stampAlerts: vi.fn(async () => ({ error: { message: 'permission denied' } })),
    }
    await expect(stampAlertEmail(db, ['a1'], { email_error: 'x' })).rejects.toThrow('alerts email stamp: permission denied')
  })
})
