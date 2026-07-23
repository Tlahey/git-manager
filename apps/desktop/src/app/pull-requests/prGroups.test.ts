import { describe, it, expect } from 'vitest'
import { classifyPr, groupPrs, PR_GROUP_ORDER } from './prGroups'
import type { MockPR } from './types'

function makePr(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: 'id',
    number: 1,
    title: 'title',
    repo: 'repo',
    repoUrl: 'https://github.com/o/repo',
    url: 'https://github.com/o/repo/pull/1',
    status: 'open',
    ciStatus: 'success',
    author: 'me',
    authorAvatar: '',
    collaborators: [{ login: 'reviewer', avatar: '' }],
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

describe('classifyPr', () => {
  it('classifies an approved, conflict-free PR as ready to merge', () => {
    expect(classifyPr(makePr({ status: 'approved' }))).toBe('readyToMerge')
  })

  it('classifies an open PR with no requested reviewers as unassigned reviewers', () => {
    expect(classifyPr(makePr({ collaborators: [] }))).toBe('unassignedReviewers')
  })

  it('surfaces a conflicted PR under resolve conflicts even when it has no reviewers', () => {
    expect(classifyPr(makePr({ collaborators: [], needsRebase: true }))).toBe('resolveConflicts')
  })

  it('never marks an approved-but-conflicted PR as ready to merge', () => {
    expect(classifyPr(makePr({ status: 'approved', needsRebase: true }))).toBe('resolveConflicts')
  })

  it('classifies a PR requesting my review under needs my review', () => {
    expect(classifyPr(makePr({ needsMyReview: true }))).toBe('needsMyReview')
  })

  it('classifies a draft PR under draft (draft wins over an empty reviewer list)', () => {
    expect(classifyPr(makePr({ isDraft: true, collaborators: [] }))).toBe('draft')
  })

  it('falls back to other for an in-review PR with reviewers assigned', () => {
    expect(classifyPr(makePr())).toBe('other')
  })
})

describe('groupPrs', () => {
  it('partitions every PR into exactly one bucket, preserving order', () => {
    const prs = [
      makePr({ id: 'a', status: 'approved' }),
      makePr({ id: 'b', collaborators: [] }),
      makePr({ id: 'c', needsRebase: true }),
      makePr({ id: 'd' }),
    ]
    const groups = groupPrs(prs)
    const total = PR_GROUP_ORDER.reduce((n, key) => n + groups[key].length, 0)
    expect(total).toBe(prs.length)
    expect(groups.readyToMerge.map((p) => p.id)).toEqual(['a'])
    expect(groups.unassignedReviewers.map((p) => p.id)).toEqual(['b'])
    expect(groups.resolveConflicts.map((p) => p.id)).toEqual(['c'])
    expect(groups.other.map((p) => p.id)).toEqual(['d'])
  })
})
