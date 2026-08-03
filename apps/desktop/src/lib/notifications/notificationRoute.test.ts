import { describe, it, expect } from 'vitest'
import { buildNotificationRoute } from './notificationRoute'
import type { AppNotification } from '../../stores/notification.store'

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 7,
    type: 'pr_merged',
    repo: 'git-manager',
    fullName: 'Tlahey/git-manager',
    prNumber: 42,
    prTitle: 'feat: add thing',
    prId: 'pr-42',
    author: 'antoine',
    createdAt: 0,
    read: false,
    targetTab: 'prs',
    ...overrides,
  }
}

describe('buildNotificationRoute', () => {
  it('carries everything a click needs to reach the PR', () => {
    expect(buildNotificationRoute(notification())).toEqual({
      kind: 'pull-request',
      notificationId: 7,
      prNumber: 42,
      prId: 'pr-42',
      repo: 'git-manager',
      fullName: 'Tlahey/git-manager',
      targetTab: 'prs',
    })
  })

  // The Launchpad tab is the only thing that differs between kinds, and the registry has already
  // resolved it into the notification by the time it gets here.
  it('keeps the notification kind its own launchpad tab', () => {
    const route = buildNotificationRoute(
      notification({ type: 'review_requested', targetTab: 'waiting' })
    )
    expect(route).toMatchObject({ kind: 'pull-request', targetTab: 'waiting' })
  })

  // Notifications persisted before `fullName` existed are still in localStorage; the key must be
  // absent rather than `undefined`, since the route is serialised through Rust.
  it('omits fullName entirely when the notification has none', () => {
    const route = buildNotificationRoute(notification({ fullName: undefined }))
    expect(route).not.toHaveProperty('fullName')
  })
})
