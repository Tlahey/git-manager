import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { SWRConfig } from 'swr'

const fetchGitHubPRDetails = vi.fn()
vi.mock('../api/github.api', () => ({
  fetchGitHubPRDetails: (...a: unknown[]) => fetchGitHubPRDetails(...a),
}))

const useRepoGitHub = vi.fn()
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: () => useRepoGitHub() }))

import { usePrDetail } from './usePrDetail'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

beforeEach(() => {
  fetchGitHubPRDetails.mockReset()
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
})

describe('usePrDetail', () => {
  it('skips fetching when no PR is selected', () => {
    renderHook(() => usePrDetail('/repo', null), { wrapper })
    expect(fetchGitHubPRDetails).not.toHaveBeenCalled()
  })

  it('fetches the PR details endpoint', async () => {
    fetchGitHubPRDetails.mockResolvedValue({ number: 7, title: 'T' })
    const { result } = renderHook(() => usePrDetail('/repo', 7), { wrapper })
    await waitFor(() => expect(result.current.pr).toEqual({ number: 7, title: 'T' }))
    expect(fetchGitHubPRDetails).toHaveBeenCalledWith(
      'https://api.github.com/repos/org/repo/pulls/7',
      'tok'
    )
  })
})
