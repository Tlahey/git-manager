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

beforeEach(() => {
  vi.clearAllMocks()
  mocked.fetchIssueDetail.mockResolvedValue({ number: 7, body: 'hi' })
})

describe('useIssueDetail', () => {
  it('fetches when owner/repo + token + number are known', async () => {
    mocked.useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
    const { result } = renderHook(() => useIssueDetail('org/repo', 7), { wrapper })
    await waitFor(() => expect(result.current.issue?.body).toBe('hi'))
    expect(mocked.fetchIssueDetail).toHaveBeenCalledWith('org', 'repo', 7, 'tok')
  })

  it('does not fetch without a token', () => {
    mocked.useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: null })
    renderHook(() => useIssueDetail('org/repo', 7), { wrapper })
    expect(mocked.fetchIssueDetail).not.toHaveBeenCalled()
  })
})
