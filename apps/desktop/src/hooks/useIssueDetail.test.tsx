import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', () => ({ fetchIssueDetail: vi.fn() }))
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: vi.fn() }))

import { fetchIssueDetail } from '../api/github.api'
import { useRepoGitHub } from './useRepoGitHub'
import { useIssueDetail } from './useIssueDetail'

const mocked = {
  fetchIssueDetail: fetchIssueDetail as unknown as ReturnType<typeof vi.fn>,
  useRepoGitHub: useRepoGitHub as unknown as ReturnType<typeof vi.fn>,
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

const base = {
  ownerRepo: { owner: 'org', repo: 'repo' } as { owner: string; repo: string } | null,
  accountId: 'acct' as string | null,
  remotesError: undefined as unknown,
  isResolvingRemotes: false,
  retryRemotes: () => {},
}

beforeEach(() => {
  vi.clearAllMocks()
  mocked.fetchIssueDetail.mockResolvedValue({ number: 7, body: 'hi' })
})

describe('useIssueDetail', () => {
  it('fetches when owner/repo + accountId + number are known', async () => {
    mocked.useRepoGitHub.mockReturnValue({ ...base })
    const { result } = renderHook(() => useIssueDetail('org/repo', 7), { wrapper })
    await waitFor(() => expect(result.current.issue?.body).toBe('hi'))
    expect(mocked.fetchIssueDetail).toHaveBeenCalledWith('org', 'repo', 7, 'acct')
  })

  it('does not fetch without a accountId', () => {
    mocked.useRepoGitHub.mockReturnValue({ ...base, accountId: null })
    renderHook(() => useIssueDetail('org/repo', 7), { wrapper })
    expect(mocked.fetchIssueDetail).not.toHaveBeenCalled()
  })

  it('surfaces a remotes-resolution failure instead of hanging with no signal', () => {
    mocked.useRepoGitHub.mockReturnValue({
      ...base,
      ownerRepo: null,
      remotesError: new Error('could not read remotes'),
    })
    const { result } = renderHook(() => useIssueDetail('/repo', 7), { wrapper })
    expect(mocked.fetchIssueDetail).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failure).toEqual({ reason: 'remotes', cause: expect.any(Error) })
  })

  it('reports a "no GitHub remote" failure once resolution settles with nothing found', () => {
    mocked.useRepoGitHub.mockReturnValue({ ...base, ownerRepo: null })
    const { result } = renderHook(() => useIssueDetail('/repo', 7), { wrapper })
    expect(mocked.fetchIssueDetail).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failure).toEqual({ reason: 'no-github-remote' })
  })

  it('reports a "no account" failure rather than spinning when no account is connected', () => {
    mocked.useRepoGitHub.mockReturnValue({ ...base, accountId: null })
    const { result } = renderHook(() => useIssueDetail('/repo', 7), { wrapper })
    expect(mocked.fetchIssueDetail).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.failure).toEqual({ reason: 'no-account' })
  })

  it('retries the remotes lookup too, since a null SWR key makes mutate() a no-op', () => {
    const retryRemotes = vi.fn()
    mocked.useRepoGitHub.mockReturnValue({ ...base, ownerRepo: null, retryRemotes })
    const { result } = renderHook(() => useIssueDetail('/repo', 7), { wrapper })
    result.current.refresh()
    expect(retryRemotes).toHaveBeenCalled()
  })
})
