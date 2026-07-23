import { describe, it, expect } from 'vitest'
import { canMergePr, defaultPrActionKey } from './prActions'
import type { MockPR } from './types'

function pr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'pr-1',
    number: 1,
    title: 'Test PR',
    repo: 'repo',
    repoUrl: 'https://github.com/me/repo',
    url: 'https://github.com/me/repo/pull/1',
    status: 'open',
    ciStatus: 'success',
    author: 'me',
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

describe('canMergePr', () => {
  it('is true for your own open PR with green CI and no rebase needed', () => {
    expect(canMergePr(pr(), 'me')).toBe(true)
  })

  it("is false for someone else's PR", () => {
    expect(canMergePr(pr({ author: 'other' }), 'me')).toBe(false)
  })

  it('is false when CI is not successful', () => {
    expect(canMergePr(pr({ ciStatus: 'failure' }), 'me')).toBe(false)
  })

  it('is false when the branch is behind (needs rebase)', () => {
    expect(canMergePr(pr({ needsRebase: true }), 'me')).toBe(false)
  })

  it('is false for a draft PR', () => {
    expect(canMergePr(pr({ isDraft: true }), 'me')).toBe(false)
  })

  it('is false when there is no current user', () => {
    expect(canMergePr(pr(), null)).toBe(false)
  })
})

describe('defaultPrActionKey', () => {
  it('leads with Open in GitHub for a merged PR', () => {
    expect(defaultPrActionKey(pr({ status: 'merged' }), 'me')).toBe('openGitHub')
  })

  it('leads with Open in GitHub for a closed PR', () => {
    expect(defaultPrActionKey(pr({ status: 'closed' }), 'me')).toBe('openGitHub')
  })

  it('leads with Review when the PR needs my review', () => {
    expect(defaultPrActionKey(pr({ author: 'other', needsMyReview: true }), 'me')).toBe('review')
  })

  it('leads with Merge for my own mergeable PR', () => {
    expect(defaultPrActionKey(pr(), 'me')).toBe('merge')
  })

  it('leads with View for an open PR I cannot merge yet', () => {
    expect(defaultPrActionKey(pr({ ciStatus: 'running' }), 'me')).toBe('view')
  })
})
