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
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, accountId: 'acct' })
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
      'acct'
    )
  })

  it('surfaces a remotes-resolution error instead of hanging with no signal', () => {
    useRepoGitHub.mockReturnValue({
      ownerRepo: null,
      accountId: 'acct',
      remotesError: new Error('could not read remotes'),
      isResolvingRemotes: false,
    })
    const { result } = renderHook(() => usePrDetail('/repo', 7), { wrapper })
    expect(fetchGitHubPRDetails).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('reports a "no GitHub remote" error once resolution settles with nothing found', () => {
    useRepoGitHub.mockReturnValue({
      ownerRepo: null,
      accountId: 'acct',
      remotesError: undefined,
      isResolvingRemotes: false,
    })
    const { result } = renderHook(() => usePrDetail('/repo', 7), { wrapper })
    expect(fetchGitHubPRDetails).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('keeps loading (no premature error) while remotes are still resolving', () => {
    useRepoGitHub.mockReturnValue({
      ownerRepo: null,
      accountId: 'acct',
      remotesError: undefined,
      isResolvingRemotes: true,
    })
    const { result } = renderHook(() => usePrDetail('/repo', 7), { wrapper })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeUndefined()
  })
})
