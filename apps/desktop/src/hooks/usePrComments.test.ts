import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { SWRConfig } from 'swr'

const fetchPrComments = vi.fn()
const fetchPrReviewComments = vi.fn()
vi.mock('../api/github.api', () => ({
  fetchPrComments: (...a: unknown[]) => fetchPrComments(...a),
  fetchPrReviewComments: (...a: unknown[]) => fetchPrReviewComments(...a),
}))

const useRepoGitHub = vi.fn()
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: () => useRepoGitHub() }))
vi.mock('./useGithubPollInterval', () => ({ useGithubPollInterval: () => 0 }))

import { usePrComments } from './usePrComments'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

const comment = (id: number, created_at: string) => ({
  id,
  body: `comment ${id}`,
  html_url: `https://github.com/acme/app/pull/7#issuecomment-${id}`,
  created_at,
  updated_at: created_at,
  user: { login: 'octocat', avatar_url: 'https://x/o.png' },
})

beforeEach(() => {
  fetchPrComments.mockReset()
  fetchPrReviewComments.mockReset()
  fetchPrComments.mockResolvedValue([])
  fetchPrReviewComments.mockResolvedValue([])
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'acme', repo: 'app' }, accountId: 'acct' })
})

describe('usePrComments', () => {
  it('skips fetching when no PR is selected', () => {
    renderHook(() => usePrComments('/repo', null), { wrapper })
    expect(fetchPrComments).not.toHaveBeenCalled()
  })

  it('leaves reviews alone by default, since the issue view has none', async () => {
    fetchPrComments.mockResolvedValue([comment(1, '2026-09-01T10:00:00Z')])

    const { result } = renderHook(() => usePrComments('/repo', 7), { wrapper })

    await waitFor(() => expect(result.current.comments).toHaveLength(1))
    expect(fetchPrReviewComments).not.toHaveBeenCalled()
    expect(result.current.comments[0].key).toBe('comment-1')
    expect(result.current.comments[0].reviewState).toBeUndefined()
  })

  it('merges submitted reviews into the timeline in chronological order', async () => {
    fetchPrComments.mockResolvedValue([
      comment(1, '2026-09-01T12:00:00Z'),
      comment(2, '2026-09-01T08:00:00Z'),
    ])
    fetchPrReviewComments.mockResolvedValue([
      {
        id: 9,
        body: 'Copilot reviewed 12 files.',
        html_url: 'https://github.com/acme/app/pull/7#pullrequestreview-9',
        created_at: '2026-09-01T10:00:00Z',
        updated_at: '2026-09-01T10:00:00Z',
        user: { login: 'Copilot', avatar_url: 'https://x/c.png' },
        state: 'COMMENTED' as const,
      },
    ])

    const { result } = renderHook(() => usePrComments('/repo', 7, { withReviews: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.comments).toHaveLength(3))
    expect(result.current.comments.map((c) => c.key)).toEqual([
      'comment-2',
      'review-9',
      'comment-1',
    ])
    expect(result.current.comments[1].reviewState).toBe('COMMENTED')
    expect(fetchPrReviewComments).toHaveBeenCalledWith('acme', 'app', 7, 'acct')
  })

  it('keys a review apart from an issue comment sharing its id', async () => {
    fetchPrComments.mockResolvedValue([comment(5, '2026-09-01T08:00:00Z')])
    fetchPrReviewComments.mockResolvedValue([
      {
        id: 5,
        body: 'Changes needed',
        html_url: '',
        created_at: '2026-09-01T09:00:00Z',
        updated_at: '2026-09-01T09:00:00Z',
        state: 'CHANGES_REQUESTED' as const,
      },
    ])

    const { result } = renderHook(() => usePrComments('/repo', 7, { withReviews: true }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.comments).toHaveLength(2))
    expect(new Set(result.current.comments.map((c) => c.key)).size).toBe(2)
  })
})
