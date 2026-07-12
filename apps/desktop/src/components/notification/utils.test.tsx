import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { getNotificationText, getNotificationIcon } from './utils'
import type { AppNotification } from '../../stores/notification.store'
import type { TFunction } from '@git-manager/i18n'

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 1,
    type: 'new_pr',
    repo: 'org/repo',
    prNumber: 42,
    prTitle: 'Add feature',
    prId: 'pr-42',
    author: 'octocat',
    createdAt: Date.now(),
    read: false,
    targetTab: 'prs',
    ...overrides,
  }
}

function fakeT() {
  return vi.fn((key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}:${JSON.stringify(opts)}` : key
  ) as unknown as TFunction
}

describe('getNotificationText', () => {
  it('templates title and message using the notification type as the i18n key suffix', () => {
    const t = fakeT()
    const { title } = getNotificationText(notification({ type: 'pr_merged' }), t)
    expect(title).toContain('notifications.types.pr_merged')
    expect(t).toHaveBeenCalledWith('notifications.types.pr_merged', { number: 42 })
  })

  it('passes PR metadata through to the message translation', () => {
    const t = fakeT()
    getNotificationText(
      notification({ prNumber: 7, prTitle: 'Fix bug', repo: 'org/repo', author: 'alice' }),
      t
    )
    expect(t).toHaveBeenCalledWith(
      'notifications.messages.new_pr',
      expect.objectContaining({ number: 7, title: 'Fix bug', repo: 'org/repo', author: 'alice' })
    )
  })

  it('translates reviewStatus "approved" to a pre-translated status string', () => {
    const t = fakeT()
    getNotificationText(notification({ reviewStatus: 'approved' }), t)
    expect(t).toHaveBeenCalledWith('notifications.status.approved')
    expect(t).toHaveBeenCalledWith(
      'notifications.messages.new_pr',
      expect.objectContaining({ status: 'notifications.status.approved' })
    )
  })

  it('translates reviewStatus "changes_requested" to a pre-translated status string', () => {
    const t = fakeT()
    getNotificationText(notification({ reviewStatus: 'changes_requested' }), t)
    expect(t).toHaveBeenCalledWith('notifications.status.changes_requested')
  })

  it('passes through other reviewStatus values (e.g. "pending") as raw text', () => {
    const t = fakeT()
    getNotificationText(notification({ reviewStatus: 'pending' }), t)
    expect(t).toHaveBeenCalledWith(
      'notifications.messages.new_pr',
      expect.objectContaining({ status: 'pending' })
    )
  })

  it('uses an empty status string when reviewStatus is absent', () => {
    const t = fakeT()
    getNotificationText(notification({ reviewStatus: undefined }), t)
    expect(t).toHaveBeenCalledWith(
      'notifications.messages.new_pr',
      expect.objectContaining({ status: '' })
    )
  })
})

describe('getNotificationIcon', () => {
  it('renders the icon registered for a known notification type', () => {
    const { container } = render(<>{getNotificationIcon('pr_merged')}</>)
    expect(container.querySelector('.bg-purple-500\\/10')).toBeTruthy()
  })

  it('renders a distinct icon per notification type', () => {
    const { container: newPr } = render(<>{getNotificationIcon('new_pr')}</>)
    const { container: ciFailed } = render(<>{getNotificationIcon('ci_failed')}</>)
    expect(newPr.querySelector('.bg-cyan-500\\/10')).toBeTruthy()
    expect(ciFailed.querySelector('.bg-rose-500\\/10')).toBeTruthy()
  })

  it('falls back to the default icon for an unregistered type', () => {
    const { container } = render(
      <>{getNotificationIcon('unknown_type' as AppNotification['type'])}</>
    )
    expect(container.querySelector('.bg-sky-500\\/10')).toBeTruthy()
  })
})
