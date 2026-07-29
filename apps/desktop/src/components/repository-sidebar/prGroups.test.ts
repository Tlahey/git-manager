import { describe, it, expect } from 'vitest'
import type { PullRequest } from '@git-manager/git-types'
import { groupPullRequests } from './prGroups'
import { PR_GROUP_ORDER } from './types'

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'A pull request',
    body: '',
    state: 'open',
    author: 'someone',
    authorAvatar: '',
    headRef: 'feature',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    assignees: [],
    requestedReviewers: [],
    labels: [],
    ...overrides,
  }
}

function numbersIn(groups: ReturnType<typeof groupPullRequests>, key: string) {
  return groups.find((g) => g.key === key)!.prs.map((p) => p.number)
}

describe('groupPullRequests', () => {
  it('returns the four groups in a stable order', () => {
    expect(groupPullRequests([], 'antoine').map((g) => g.key)).toEqual(PR_GROUP_ORDER)
  })

  it('puts every PR under "all" regardless of who is signed in', () => {
    const prs = [pr({ number: 1 }), pr({ number: 2 })]
    expect(numbersIn(groupPullRequests(prs, 'antoine'), 'all')).toEqual([1, 2])
    expect(numbersIn(groupPullRequests(prs, undefined), 'all')).toEqual([1, 2])
  })

  it('collects the signed-in user\'s own PRs under "mine"', () => {
    const groups = groupPullRequests(
      [pr({ number: 1, author: 'antoine' }), pr({ number: 2, author: 'marie' })],
      'antoine'
    )
    expect(numbersIn(groups, 'mine')).toEqual([1])
  })

  it('collects PRs assigned to the signed-in user under "assigned"', () => {
    const groups = groupPullRequests(
      [
        pr({ number: 1, assignees: [{ login: 'antoine', avatarUrl: '' }] }),
        pr({ number: 2, assignees: [{ login: 'marie', avatarUrl: '' }] }),
      ],
      'antoine'
    )
    expect(numbersIn(groups, 'assigned')).toEqual([1])
  })

  it('collects PRs still requesting the user\'s review under "awaitingReview"', () => {
    const groups = groupPullRequests(
      [
        pr({ number: 1, author: 'marie', requestedReviewers: [{ login: 'antoine', avatarUrl: '' }] }),
        pr({ number: 2, author: 'marie', requestedReviewers: [{ login: 'bob', avatarUrl: '' }] }),
      ],
      'antoine'
    )
    expect(numbersIn(groups, 'awaitingReview')).toEqual([1])
  })

  // GitHub won't let you review your own PR, so a self-requested review is never actionable.
  it('never lists the user\'s own PR as awaiting their review', () => {
    const groups = groupPullRequests(
      [pr({ number: 1, author: 'antoine', requestedReviewers: [{ login: 'antoine', avatarUrl: '' }] })],
      'antoine'
    )
    expect(numbersIn(groups, 'awaitingReview')).toEqual([])
    expect(numbersIn(groups, 'mine')).toEqual([1])
  })

  // The groups are overlapping views, not a partition — one PR can legitimately appear in three.
  it('lists one PR under every group it qualifies for', () => {
    const groups = groupPullRequests(
      [pr({ number: 7, author: 'antoine', assignees: [{ login: 'antoine', avatarUrl: '' }] })],
      'antoine'
    )
    expect(numbersIn(groups, 'mine')).toEqual([7])
    expect(numbersIn(groups, 'assigned')).toEqual([7])
    expect(numbersIn(groups, 'all')).toEqual([7])
  })

  it('leaves the three personal groups empty when nobody is signed in', () => {
    const groups = groupPullRequests(
      [pr({ number: 1, author: 'antoine', assignees: [{ login: 'antoine', avatarUrl: '' }] })],
      undefined
    )
    expect(numbersIn(groups, 'mine')).toEqual([])
    expect(numbersIn(groups, 'assigned')).toEqual([])
    expect(numbersIn(groups, 'awaitingReview')).toEqual([])
    expect(numbersIn(groups, 'all')).toEqual([1])
  })
})
