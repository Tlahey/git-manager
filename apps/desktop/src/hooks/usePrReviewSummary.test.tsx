import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const { useSWRMock, fetchPrReviewSummary, useRepoGitHub, useGithubPollInterval } = vi.hoisted(
  () => ({
    useSWRMock: vi.fn(),
    fetchPrReviewSummary: vi.fn(),
    useRepoGitHub: vi.fn(),
    useGithubPollInterval: vi.fn(),
  })
)
vi.mock('swr', () => ({ default: useSWRMock }))
vi.mock('../api/github.api', () => ({ fetchPrReviewSummary }))
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub }))
vi.mock('./useGithubPollInterval', () => ({ useGithubPollInterval }))

import { usePrReviewSummary } from './usePrReviewSummary'

/** The SWR key the hook computed on the last render — `null` means "don't fetch". */
function lastKey() {
  return useSWRMock.mock.calls.at(-1)![0]
}

/** The SWR options the hook passed on the last render. */
function lastOptions() {
  return useSWRMock.mock.calls.at(-1)![2]
}

beforeEach(() => {
  useSWRMock.mockReset().mockReturnValue({ data: undefined, isLoading: false, error: undefined })
  fetchPrReviewSummary.mockReset().mockResolvedValue({
    reviewDecision: null,
    reviewers: [],
    checksState: null,
  })
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, accountId: 'acct' })
  useGithubPollInterval.mockReset().mockImplementation((base: number) => base)
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
    expect(lastKey()).toEqual(['pr-review-summary', 'org', 'repo', 42, 'acct'])
  })

  it('does not fetch without a PR number', () => {
    renderHook(() => usePrReviewSummary('/repo', null, true))
    expect(lastKey()).toBeNull()
  })

  it('does not fetch when the repo has no GitHub remote', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: null, accountId: 'acct' })
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    expect(lastKey()).toBeNull()
  })

  it('does not fetch when signed out', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, accountId: null })
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    expect(lastKey()).toBeNull()
  })
})

describe('usePrReviewSummary — polling', () => {
  // The hover card is on screen only while the pointer rests on a row, so it must not re-poll;
  // a long-lived surface (the PR detail panel) opts in by passing an interval.
  it('does not poll by default', () => {
    renderHook(() => usePrReviewSummary('/repo', 42, true))
    expect(useGithubPollInterval).toHaveBeenCalledWith(0, 'acct', 'graphql')
    expect(lastOptions().refreshInterval).toBe(0)
  })

  it('polls on the requested interval, throttled by the GitHub quota', () => {
    useGithubPollInterval.mockReturnValue(120_000)
    renderHook(() => usePrReviewSummary('/repo', 42, true, 60_000))
    expect(useGithubPollInterval).toHaveBeenCalledWith(60_000, 'acct', 'graphql')
    expect(lastOptions().refreshInterval).toBe(120_000)
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

    await fetcher(['pr-review-summary', 'org', 'repo', 42, 'acct'])

    expect(fetchPrReviewSummary).toHaveBeenCalledWith('org', 'repo', 42, 'acct')
  })
})
