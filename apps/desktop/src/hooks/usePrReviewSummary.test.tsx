import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { useSWRMock, fetchPrReviewSummary, useRepoGitHub } = vi.hoisted(() => ({
  useSWRMock: vi.fn(),
  fetchPrReviewSummary: vi.fn(),
  useRepoGitHub: vi.fn(),
}))
vi.mock('swr', () => ({ default: useSWRMock }))
vi.mock('../api/github.api', () => ({ fetchPrReviewSummary }))
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub }))

import { usePrReviewSummary } from './usePrReviewSummary'

/** The SWR key the hook computed on the last render — `null` means "don't fetch". */
function lastKey() {
  return useSWRMock.mock.calls.at(-1)![0]
}

beforeEach(() => {
  useSWRMock.mockReset().mockReturnValue({ data: undefined, isLoading: false, error: undefined })
  fetchPrReviewSummary.mockReset().mockResolvedValue({
    reviewDecision: null,
    reviewers: [],
    checksState: null,
  })
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
})

describe('usePrReviewSummary — lazy gating', () => {
  // The whole point: the sidebar can list dozens of PRs, and none of them should cost a request
  // until the pointer actually rests on that row.
  it('does not fetch while disabled', () => {
    renderHook(() => usePrReviewSummary('/repo', 42, false))
    expect(lastKey()).toBeNull()
  })

  it('fetches once enabled', () => {
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    expect(lastKey()).toEqual(['pr-review-summary', 'org', 'repo', 42, 'tok'])
  })

  it('does not fetch without a PR number', () => {
    renderHook(() => usePrReviewSummary('/repo', null, true))
    expect(lastKey()).toBeNull()
  })

  it('does not fetch when the repo has no GitHub remote', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: null, token: 'tok' })
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    expect(lastKey()).toBeNull()
  })

  it('does not fetch when signed out', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: null })
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    expect(lastKey()).toBeNull()
  })
})

describe('usePrReviewSummary — result', () => {
  it('passes the summary, loading flag and error straight through', () => {
    const summary = { reviewDecision: 'APPROVED', reviewers: [], checksState: 'SUCCESS' }
    useSWRMock.mockReturnValue({ data: summary, isLoading: true, error: 'boom' })

    const { result } = renderHook(() => usePrReviewSummary('/repo', 42, true))

    expect(result.current).toEqual({ summary, isLoading: true, error: 'boom' })
  })

  it('calls the API with the key parts when SWR runs the fetcher', async () => {
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    const fetcher = useSWRMock.mock.calls.at(-1)![1]

    await fetcher(['pr-review-summary', 'org', 'repo', 42, 'tok'])

    expect(fetchPrReviewSummary).toHaveBeenCalledWith('org', 'repo', 42, 'tok')
  })
})
