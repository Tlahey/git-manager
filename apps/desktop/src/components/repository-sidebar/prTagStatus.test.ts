import { describe, it, expect } from 'vitest'
import type { PullRequest } from '@git-manager/git-types'
import { derivePrTagStatus, PR_TAG_STATUS_LABEL_KEY } from './prTagStatus'

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 1,
    title: 'PR',
    body: '',
    state: 'open',
    author: 'a',
    authorAvatar: '',
    headRef: 'feature',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    ...overrides,
  }
}

describe('derivePrTagStatus', () => {
  it('reports a merged PR as merged regardless of CI', () => {
    expect(derivePrTagStatus(pr({ state: 'merged', ciStatus: 'failure' }))).toBe('merged')
  })

  it('reports a closed PR as closed', () => {
    expect(derivePrTagStatus(pr({ state: 'closed' }))).toBe('closed')
  })

  it('reports a draft PR as draft (via state or the isDraft flag)', () => {
    expect(derivePrTagStatus(pr({ state: 'draft' }))).toBe('draft')
    expect(derivePrTagStatus(pr({ state: 'open', isDraft: true }))).toBe('draft')
  })

  it('reports an open PR with failing checks as failed', () => {
    expect(derivePrTagStatus(pr({ state: 'open', ciStatus: 'failure' }))).toBe('failed')
  })

  it('reports an open PR with running checks as pending', () => {
    expect(derivePrTagStatus(pr({ state: 'open', ciStatus: 'pending' }))).toBe('pending')
  })

  it('reports an open PR as open when checks pass or are absent', () => {
    expect(derivePrTagStatus(pr({ state: 'open', ciStatus: 'success' }))).toBe('open')
    expect(derivePrTagStatus(pr({ state: 'open', ciStatus: null }))).toBe('open')
  })

  it('has a label key for every status it can return', () => {
    for (const status of ['open', 'merged', 'failed', 'pending', 'draft', 'closed'] as const) {
      expect(PR_TAG_STATUS_LABEL_KEY[status]).toBeTruthy()
    }
  })
})
