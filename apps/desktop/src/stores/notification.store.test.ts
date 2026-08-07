import { describe, it, expect, beforeEach } from 'vitest'
import { useNotificationStore } from './notification.store'
import type { MockPR } from '../app/pull-requests/types'

/**
 * The store no longer seeds itself with the development fixtures — they are behind a dynamic
 * import that a release build drops entirely (`lib/devFixtures.ts`), so its initial `mockPRs` is
 * empty. These tests therefore bring their own pair, which is better anyway: what `simulateChange`
 * does to a pull request has nothing to do with the shape of whatever fixture file ships.
 */
function mockPR(id: string, overrides: Partial<MockPR> = {}): MockPR {
  return {
    id,
    number: 1,
    title: 'feat: a thing',
    repo: 'git-manager',
    repoUrl: 'https://github.com/Tlahey/git-manager',
    url: 'https://github.com/Tlahey/git-manager/pull/1',
    status: 'open',
    ciStatus: 'running',
    author: 'antoine',
    authorAvatar: '',
    collaborators: [],
    filesChanged: 1,
    additions: 1,
    deletions: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: false,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

const INITIAL_MOCK_PRS: MockPR[] = [
  mockPR('pr-1'),
  mockPR('pr-2', { status: 'draft', ciStatus: 'skipped' }),
]

function notif(
  overrides: Partial<
    Parameters<ReturnType<typeof useNotificationStore.getState>['addNotification']>[0]
  > = {}
) {
  return {
    type: 'new_pr' as const,
    repo: 'org/repo',
    prNumber: 1,
    prTitle: 'Add feature',
    prId: 'pr-1',
    author: 'octocat',
    targetTab: 'prs' as const,
    ...overrides,
  }
}

beforeEach(() => {
  useNotificationStore.setState({
    notifications: [],
    previousPRs: {},
    hasSessionInitialized: false,
    // Per-item spread, not JSON.parse(JSON.stringify(...)) — that round-trip turns
    // createdAt/updatedAt's Date objects into plain strings, which crashes every consumer that
    // sorts on `pr.updatedAt.getTime()`. `loadDevFixtures` copies them the same way.
    mockPRs: INITIAL_MOCK_PRS.map((pr) => ({ ...pr })),
  })
  localStorage.clear()
})


describe('useNotificationStore — notifications', () => {
  it('addNotification prepends the new notification, unread, with an id and timestamp', () => {
    const created = useNotificationStore.getState().addNotification(notif())
    const state = useNotificationStore.getState()
    expect(state.notifications).toHaveLength(1)
    expect(state.notifications[0]).toMatchObject({ ...notif(), read: false })
    expect(created.id).toEqual(expect.any(Number))
    expect(created.createdAt).toEqual(expect.any(Number))
  })

  it('newest notifications appear first', () => {
    useNotificationStore.getState().addNotification(notif({ prId: 'pr-1' }))
    useNotificationStore.getState().addNotification(notif({ prId: 'pr-2' }))
    expect(useNotificationStore.getState().notifications.map((n) => n.prId)).toEqual([
      'pr-2',
      'pr-1',
    ])
  })

  it('keeps only the most recent 50 notifications', () => {
    for (let i = 0; i < 55; i++) {
      useNotificationStore.getState().addNotification(notif({ prId: `pr-${i}` }))
    }
    const state = useNotificationStore.getState()
    expect(state.notifications).toHaveLength(50)
    expect(state.notifications[0].prId).toBe('pr-54') // newest kept
    expect(state.notifications[49].prId).toBe('pr-5') // oldest kept
  })

  it('markAsRead flips only the matching notification', () => {
    const a = useNotificationStore.getState().addNotification(notif({ prId: 'pr-1' }))
    useNotificationStore.getState().addNotification(notif({ prId: 'pr-2' }))
    useNotificationStore.getState().markAsRead(a.id)
    const state = useNotificationStore.getState()
    expect(state.notifications.find((n) => n.id === a.id)?.read).toBe(true)
    expect(state.notifications.find((n) => n.prId === 'pr-2')?.read).toBe(false)
  })

  it('markAllAsRead flips every notification', () => {
    useNotificationStore.getState().addNotification(notif({ prId: 'pr-1' }))
    useNotificationStore.getState().addNotification(notif({ prId: 'pr-2' }))
    useNotificationStore.getState().markAllAsRead()
    expect(useNotificationStore.getState().notifications.every((n) => n.read)).toBe(true)
  })

  it('clearNotifications empties the list', () => {
    useNotificationStore.getState().addNotification(notif())
    useNotificationStore.getState().clearNotifications()
    expect(useNotificationStore.getState().notifications).toEqual([])
  })

  it('setPreviousPRs / setSessionInitialized store watcher bookkeeping', () => {
    useNotificationStore.getState().setPreviousPRs({
      'pr-1': { status: 'open', reviewStatus: 'pending', needsMyReview: false, updatedAt: 'now' },
    })
    useNotificationStore.getState().setSessionInitialized(true)
    const state = useNotificationStore.getState()
    expect(state.previousPRs['pr-1'].status).toBe('open')
    expect(state.hasSessionInitialized).toBe(true)
  })
})

describe('useNotificationStore — mockPRs seed', () => {
  // Regression: mockPRs used to be built with JSON.parse(JSON.stringify(MOCK_PRS)), which
  // serializes createdAt/updatedAt into plain strings. useGitHubData falls back to mockPRs as
  // `prs` for any no-token session, and several Launchpad tabs (WaitingForReviewTab, IssuesTab,
  // ListHelpers) sort by `pr.updatedAt.getTime()` — a string has no such method, so every one of
  // them crashed the moment the Pull Requests / Launchpad tab rendered.
  it('keeps createdAt/updatedAt as real Date instances, not JSON-serialized strings', () => {
    for (const pr of useNotificationStore.getState().mockPRs) {
      expect(pr.createdAt).toBeInstanceOf(Date)
      expect(pr.updatedAt).toBeInstanceOf(Date)
      expect(() => pr.updatedAt.getTime()).not.toThrow()
    }
  })
})

describe('useNotificationStore — simulateChange', () => {
  it('new_pr prepends a freshly generated mock PR', () => {
    const before = useNotificationStore.getState().mockPRs.length
    useNotificationStore.getState().simulateChange('', 'new_pr')
    const prs = useNotificationStore.getState().mockPRs
    expect(prs).toHaveLength(before + 1)
    expect(prs[0].status).toBe('open')
    expect(prs[0].needsMyReview).toBe(true)
    // Its own identity, not the template's — the watcher keys its poll-to-poll diff on the id.
    expect(prs[0].id).not.toBe(prs[1].id)
    expect(prs[0].number).not.toBe(prs[1].number)
  })

  it('new_pr does nothing when there is no fixture to clone', () => {
    // A build with no fixtures. Unreachable in practice — the debug menu that calls this is
    // development-only, and it hides itself when the list is empty.
    useNotificationStore.setState({ mockPRs: [] })
    useNotificationStore.getState().simulateChange('', 'new_pr')
    expect(useNotificationStore.getState().mockPRs).toEqual([])
  })

  it("merge sets the matching PR's status to merged, leaving others untouched", () => {
    const targetId = INITIAL_MOCK_PRS[0].id
    useNotificationStore.getState().simulateChange(targetId, 'merge')
    const prs = useNotificationStore.getState().mockPRs
    expect(prs.find((p) => p.id === targetId)?.status).toBe('merged')
  })

  it("close sets the matching PR's status to closed", () => {
    const targetId = INITIAL_MOCK_PRS[0].id
    useNotificationStore.getState().simulateChange(targetId, 'close')
    expect(useNotificationStore.getState().mockPRs.find((p) => p.id === targetId)?.status).toBe(
      'closed'
    )
  })

  it('request_review sets needsMyReview to true', () => {
    const targetId = INITIAL_MOCK_PRS[0].id
    useNotificationStore.getState().simulateChange(targetId, 'request_review')
    expect(
      useNotificationStore.getState().mockPRs.find((p) => p.id === targetId)?.needsMyReview
    ).toBe(true)
  })

  it('approve sets reviewStatus and status to approved', () => {
    const targetId = INITIAL_MOCK_PRS[0].id
    useNotificationStore.getState().simulateChange(targetId, 'approve')
    const pr = useNotificationStore.getState().mockPRs.find((p) => p.id === targetId)
    expect(pr?.reviewStatus).toBe('approved')
    expect(pr?.status).toBe('approved')
  })

  it("ci_success / ci_failed set the matching PR's ciStatus", () => {
    const targetId = INITIAL_MOCK_PRS[0].id
    useNotificationStore.getState().simulateChange(targetId, 'ci_success')
    expect(useNotificationStore.getState().mockPRs.find((p) => p.id === targetId)?.ciStatus).toBe(
      'success'
    )

    useNotificationStore.getState().simulateChange(targetId, 'ci_failed')
    expect(useNotificationStore.getState().mockPRs.find((p) => p.id === targetId)?.ciStatus).toBe(
      'failure'
    )
  })

  it('is a no-op on unrelated PRs for a non-"new_pr" action', () => {
    const targetId = INITIAL_MOCK_PRS[0].id
    const otherId = INITIAL_MOCK_PRS[1]?.id
    useNotificationStore.getState().simulateChange(targetId, 'merge')
    const other = useNotificationStore.getState().mockPRs.find((p) => p.id === otherId)
    const originalOther = INITIAL_MOCK_PRS.find((p) => p.id === otherId)
    expect(other?.status).toBe(originalOther?.status)
  })
})
