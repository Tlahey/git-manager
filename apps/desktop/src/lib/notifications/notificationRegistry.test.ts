import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_TYPES,
  getNotificationTypeDef,
  resolveTargetTab,
  isNotificationTypeEnabled,
  type PreviousPRSnapshot,
} from './notificationRegistry'
import type { MockPR } from '../github/types'
import type { NotificationSettings } from '@git-manager/git-types'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: '1',
    number: 1,
    title: 'Add feature',
    repo: 'repo',
    repoUrl: 'https://github.com/org/repo',
    url: 'https://github.com/org/repo/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'octocat',
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

function snapshot(overrides: Partial<PreviousPRSnapshot> = {}): PreviousPRSnapshot {
  return {
    status: 'open',
    reviewStatus: 'pending',
    needsMyReview: false,
    ciStatus: null,
    autoMerge: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('getNotificationTypeDef', () => {
  it('finds a def by type', () => {
    expect(getNotificationTypeDef('new_pr')?.type).toBe('new_pr')
  })

  it('returns undefined for an unknown type', () => {
    expect(getNotificationTypeDef('nonexistent' as MockPR['status'] as never)).toBeUndefined()
  })

  it('registers exactly one def per NOTIFICATION_TYPES entry, no duplicate types', () => {
    const types = NOTIFICATION_TYPES.map((d) => d.type)
    expect(new Set(types).size).toBe(types.length)
  })
})

describe('resolveTargetTab', () => {
  it('resolves a static string targetTab', () => {
    const def = getNotificationTypeDef('pr_merged')!
    expect(resolveTargetTab(def, pr())).toBe('prs')
  })

  it('resolves a function targetTab based on the PR (new_pr → waiting when needsMyReview)', () => {
    const def = getNotificationTypeDef('new_pr')!
    expect(resolveTargetTab(def, pr({ needsMyReview: true }))).toBe('waiting')
    expect(resolveTargetTab(def, pr({ needsMyReview: false }))).toBe('prs')
  })
})

describe('isNotificationTypeEnabled', () => {
  const notifications: NotificationSettings = {
    enabled: true,
    notifyOnFetch: true,
    notifyOnPull: true,
    notifyOnPush: true,
    enableSound: false,
    soundName: 'default',
    notifyOnPrMerged: false,
    notifyOnPrQueued: true,
    notifyOnReviewRequested: true,
    notifyOnReviewStatusChanged: true,
    notifyOnNewPr: true,
    notifyOnCi: false,
  }

  it('gates both CI outcomes behind the single notifyOnCi toggle', () => {
    expect(isNotificationTypeEnabled(getNotificationTypeDef('ci_success')!, notifications)).toBe(
      false
    )
    expect(isNotificationTypeEnabled(getNotificationTypeDef('ci_failed')!, notifications)).toBe(
      false
    )
    expect(
      isNotificationTypeEnabled(getNotificationTypeDef('ci_failed')!, {
        ...notifications,
        notifyOnCi: true,
      })
    ).toBe(true)
  })

  it('gates the queued step behind its own toggle', () => {
    const def = getNotificationTypeDef('pr_queued')!
    expect(isNotificationTypeEnabled(def, notifications)).toBe(true)
    expect(isNotificationTypeEnabled(def, { ...notifications, notifyOnPrQueued: false })).toBe(
      false
    )
  })

  it('reflects the matching settings key when false', () => {
    const def = getNotificationTypeDef('pr_merged')!
    expect(isNotificationTypeEnabled(def, notifications)).toBe(false)
  })

  it('reflects the matching settings key when true', () => {
    const def = getNotificationTypeDef('review_requested')!
    expect(isNotificationTypeEnabled(def, notifications)).toBe(true)
  })

  it('defaults to true when notifications settings are undefined', () => {
    const def = getNotificationTypeDef('pr_merged')!
    expect(isNotificationTypeEnabled(def, undefined)).toBe(true)
  })
})

describe('detect — new_pr', () => {
  const detect = getNotificationTypeDef('new_pr')!.detect

  it('fires when there is no previous snapshot', () => {
    expect(detect(pr(), undefined)).toBe(true)
  })

  it('does not fire once a previous snapshot exists', () => {
    expect(detect(pr(), snapshot())).toBe(false)
  })

  it('does not announce a PR first seen already merged or closed as new', () => {
    expect(detect(pr({ status: 'merged' }), undefined)).toBe(false)
    expect(detect(pr({ status: 'closed' }), undefined)).toBe(false)
  })
})

describe('detect — pr_queued', () => {
  const detect = getNotificationTypeDef('pr_queued')!.detect

  it('fires when auto-merge is armed', () => {
    expect(detect(pr({ autoMerge: true }), snapshot({ autoMerge: false }))).toBe(true)
  })

  it('does not fire while auto-merge stays armed', () => {
    expect(detect(pr({ autoMerge: true }), snapshot({ autoMerge: true }))).toBe(false)
  })

  it('does not fire without a previous snapshot', () => {
    expect(detect(pr({ autoMerge: true }), undefined)).toBe(false)
  })
})

describe('terminal PR states suppress every mid-flight step', () => {
  // A poll that catches a merge often catches whatever else moved with it (checks finishing, the
  // review request dropping). None of that is worth an alert once the PR is gone.
  const terminalCases = [
    ['ci_success', pr({ ciStatus: 'success' }), snapshot({ ciStatus: 'running' })],
    ['ci_failed', pr({ ciStatus: 'failure' }), snapshot({ ciStatus: 'running' })],
    ['review_requested', pr({ needsMyReview: true }), snapshot({ needsMyReview: false })],
    [
      'review_status_changed',
      pr({ reviewStatus: 'approved' }),
      snapshot({ reviewStatus: 'pending' }),
    ],
    ['pr_queued', pr({ autoMerge: true }), snapshot({ autoMerge: false })],
  ] as const

  it.each(terminalCases)('%s stays silent on a merged PR', (type, changed, prev) => {
    const detect = getNotificationTypeDef(type)!.detect
    expect(detect(changed, prev)).toBe(true)
    expect(detect({ ...changed, status: 'merged' }, prev)).toBe(false)
    expect(detect({ ...changed, status: 'closed' }, prev)).toBe(false)
  })
})

describe('detect — pr_merged / pr_closed', () => {
  it('pr_merged fires when status transitions to merged', () => {
    const detect = getNotificationTypeDef('pr_merged')!.detect
    expect(detect(pr({ status: 'merged' }), snapshot({ status: 'open' }))).toBe(true)
    expect(detect(pr({ status: 'merged' }), snapshot({ status: 'merged' }))).toBe(false)
    expect(detect(pr({ status: 'merged' }), undefined)).toBe(false)
  })

  it('pr_closed fires when status transitions to closed', () => {
    const detect = getNotificationTypeDef('pr_closed')!.detect
    expect(detect(pr({ status: 'closed' }), snapshot({ status: 'open' }))).toBe(true)
    expect(detect(pr({ status: 'open' }), snapshot({ status: 'open' }))).toBe(false)
  })

  it('pr_merged and pr_closed are mutually exclusive on the same transition', () => {
    const mergedDetect = getNotificationTypeDef('pr_merged')!.detect
    const closedDetect = getNotificationTypeDef('pr_closed')!.detect
    const merged = pr({ status: 'merged' })
    expect(mergedDetect(merged, snapshot())).toBe(true)
    expect(closedDetect(merged, snapshot())).toBe(false)
  })
})

describe('detect — review_requested', () => {
  const detect = getNotificationTypeDef('review_requested')!.detect

  it('fires when needsMyReview turns true', () => {
    expect(detect(pr({ needsMyReview: true }), snapshot({ needsMyReview: false }))).toBe(true)
  })

  it('does not fire without a previous snapshot', () => {
    expect(detect(pr({ needsMyReview: true }), undefined)).toBe(false)
  })

  it('does not fire when it was already true', () => {
    expect(detect(pr({ needsMyReview: true }), snapshot({ needsMyReview: true }))).toBe(false)
  })
})

describe('detect — review_status_changed', () => {
  const def = getNotificationTypeDef('review_status_changed')!

  it('fires when review status changes to approved', () => {
    expect(
      def.detect(pr({ reviewStatus: 'approved' }), snapshot({ reviewStatus: 'pending' }))
    ).toBe(true)
  })

  it('fires when review status changes to changes_requested', () => {
    expect(
      def.detect(pr({ reviewStatus: 'changes_requested' }), snapshot({ reviewStatus: 'pending' }))
    ).toBe(true)
  })

  it('does not fire when the new status is pending', () => {
    expect(
      def.detect(pr({ reviewStatus: 'pending' }), snapshot({ reviewStatus: 'approved' }))
    ).toBe(false)
  })

  it('does not fire when unchanged', () => {
    expect(
      def.detect(pr({ reviewStatus: 'approved' }), snapshot({ reviewStatus: 'approved' }))
    ).toBe(false)
  })

  it('exposes a reviewStatus accessor mirroring the PR', () => {
    expect(def.reviewStatus?.(pr({ reviewStatus: 'approved' }))).toBe('approved')
  })
})

describe('detect — ci_success / ci_failed', () => {
  it('ci_success fires on a transition to success', () => {
    const detect = getNotificationTypeDef('ci_success')!.detect
    expect(detect(pr({ ciStatus: 'success' }), snapshot({ ciStatus: 'running' }))).toBe(true)
    expect(detect(pr({ ciStatus: 'success' }), snapshot({ ciStatus: 'success' }))).toBe(false)
  })

  it('ci_failed fires on a transition to failure', () => {
    const detect = getNotificationTypeDef('ci_failed')!.detect
    expect(detect(pr({ ciStatus: 'failure' }), snapshot({ ciStatus: 'running' }))).toBe(true)
    expect(detect(pr({ ciStatus: 'failure' }), undefined)).toBe(false)
  })
})
