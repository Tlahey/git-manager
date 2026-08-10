import { describe, it, expect } from 'vitest'
import { prMatchesSavedFilter, issueMatchesSavedFilter } from './savedFilterMatch'
import type { SavedFilter } from '../stores/launchpad.store'
import type { MockPR, MockIssue } from '../../../lib/github/types'

function filter(criteria: Partial<SavedFilter> = {}): SavedFilter {
  return {
    id: 'f1',
    name: 'My view',
    emoji: '🔍',
    type: 'both',
    createdAt: 0,
    ...criteria,
  }
}

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 7,
    title: 'feat: add the thing',
    repo: 'git-manager',
    repoUrl: '',
    url: '',
    status: 'open',
    ciStatus: null,
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
    labels: [],
    comments: 0,
    ...overrides,
  }
}

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'i-1',
    number: 12,
    title: 'Tab close button overlaps text',
    repo: 'git-manager',
    url: '',
    status: 'open',
    author: 'antoine',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

describe('prMatchesSavedFilter', () => {
  /** A view with no criteria is what the editor produces before anything is typed into it. */
  it('matches everything when the filter carries no criteria', () => {
    expect(prMatchesSavedFilter(pr(), filter())).toBe(true)
  })

  it('matches a title substring regardless of case', () => {
    expect(prMatchesSavedFilter(pr(), filter({ titleContains: 'THE THING' }))).toBe(true)
    expect(prMatchesSavedFilter(pr(), filter({ titleContains: 'other' }))).toBe(false)
  })

  it('matches an author substring, not just the whole login', () => {
    expect(
      prMatchesSavedFilter(pr({ author: 'antoinev' }), filter({ authorContains: 'antoine' }))
    ).toBe(true)
  })

  /** `repo` is the one exact-match criterion — it comes from a picker, not a text field. */
  it('requires the repo to match exactly', () => {
    expect(prMatchesSavedFilter(pr(), filter({ repo: 'git-manager' }))).toBe(true)
    expect(prMatchesSavedFilter(pr(), filter({ repo: 'git' }))).toBe(false)
  })

  it('matches when any one label contains the criterion', () => {
    const labelled = pr({ labels: ['area: graph', 'bug'] })
    expect(prMatchesSavedFilter(labelled, filter({ labelContains: 'graph' }))).toBe(true)
    expect(prMatchesSavedFilter(labelled, filter({ labelContains: 'docs' }))).toBe(false)
  })

  it('narrows by status only when the list is non-empty', () => {
    expect(prMatchesSavedFilter(pr(), filter({ statuses: [] }))).toBe(true)
    expect(prMatchesSavedFilter(pr(), filter({ statuses: ['open'] }))).toBe(true)
    expect(prMatchesSavedFilter(pr(), filter({ statuses: ['merged'] }))).toBe(false)
  })

  it('narrows on needsMyReview only when it is explicitly true', () => {
    expect(prMatchesSavedFilter(pr(), filter({ needsMyReview: true }))).toBe(false)
    expect(prMatchesSavedFilter(pr({ needsMyReview: true }), filter({ needsMyReview: true }))).toBe(
      true
    )
    // `false` means "don't filter", so a PR that needs no review still passes.
    expect(prMatchesSavedFilter(pr(), filter({ needsMyReview: false }))).toBe(true)
  })

  it('combines every criterion with AND', () => {
    const f = filter({ titleContains: 'feat', authorContains: 'antoine', repo: 'git-manager' })
    expect(prMatchesSavedFilter(pr(), f)).toBe(true)
    expect(prMatchesSavedFilter(pr({ author: 'someone-else' }), f)).toBe(false)
  })
})

describe('issueMatchesSavedFilter', () => {
  it('applies the four criteria an issue shares with a PR', () => {
    expect(issueMatchesSavedFilter(issue(), filter({ titleContains: 'overlaps' }))).toBe(true)
    expect(issueMatchesSavedFilter(issue(), filter({ repo: 'other' }))).toBe(false)
    expect(
      issueMatchesSavedFilter(issue({ labels: ['bug'] }), filter({ labelContains: 'bug' }))
    ).toBe(true)
  })

  /** An issue has no review state and its `open`/`closed` is not a PR `FilterStatus`, so the two
   * PR-only criteria must not silently exclude every issue from a mixed view. */
  it('ignores the PR-only criteria instead of failing them', () => {
    expect(issueMatchesSavedFilter(issue(), filter({ needsMyReview: true }))).toBe(true)
    expect(issueMatchesSavedFilter(issue(), filter({ statuses: ['merged'] }))).toBe(true)
  })
})
