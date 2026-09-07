import { describe, it, expect } from 'vitest'
import type { NotificationSettings } from '@git-manager/git-types'
import {
  DEFAULT_NOTIFICATION_SCOPE,
  NOTIFICATION_SCOPE_OPTIONS,
  isAuthoredByCurrentUser,
  resolveNotificationScope,
} from './notificationScope'

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
    ...overrides,
  }
}

describe('resolveNotificationScope', () => {
  it('defaults to every PR, so an upgrade adds a control without silencing anything', () => {
    expect(DEFAULT_NOTIFICATION_SCOPE).toBe('all')
    expect(resolveNotificationScope('notifyOnCi', settings())).toBe('all')
    expect(resolveNotificationScope('notifyOnCi', undefined)).toBe('all')
  })

  it('returns the stored scope for that event only', () => {
    const s = settings({ scopes: { notifyOnCi: 'mine' } })
    expect(resolveNotificationScope('notifyOnCi', s)).toBe('mine')
    expect(resolveNotificationScope('notifyOnPrMerged', s)).toBe('all')
  })

  // The setting round-trips through a hand-editable JSON file whose schema deliberately accepts any
  // string here, so the narrowing has to happen on read.
  it('falls back for a value it does not recognize', () => {
    const s = settings({ scopes: { notifyOnCi: 'thiers' as 'mine' } })
    expect(resolveNotificationScope('notifyOnCi', s)).toBe('all')
  })

  it('offers exactly the two audiences, all first', () => {
    expect(NOTIFICATION_SCOPE_OPTIONS.map((o) => o.value)).toEqual(['all', 'mine'])
  })
})

describe('isAuthoredByCurrentUser', () => {
  it('compares logins case-insensitively', () => {
    expect(isAuthoredByCurrentUser('OctoCat', 'octocat')).toBe(true)
    expect(isAuthoredByCurrentUser('octocat', 'OCTOCAT')).toBe(true)
  })

  it('is false for another author', () => {
    expect(isAuthoredByCurrentUser('hubot', 'octocat')).toBe(false)
  })

  it('is false when either side is unknown, leaving the decision to the caller', () => {
    expect(isAuthoredByCurrentUser('octocat', null)).toBe(false)
    expect(isAuthoredByCurrentUser('octocat', undefined)).toBe(false)
    expect(isAuthoredByCurrentUser(undefined, 'octocat')).toBe(false)
  })
})
