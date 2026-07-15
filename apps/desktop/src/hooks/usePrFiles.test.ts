import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { SWRConfig } from 'swr'

const fetchPrFiles = vi.fn()
vi.mock('../api/github.api', () => ({ fetchPrFiles: (...a: unknown[]) => fetchPrFiles(...a) }))

const useRepoGitHub = vi.fn()
vi.mock('./useRepoGitHub', () => ({ useRepoGitHub: () => useRepoGitHub() }))

import { usePrFiles } from './usePrFiles'

const wrapper = ({ children }: { children: React.ReactNode }) =>
  createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)

beforeEach(() => {
  fetchPrFiles.mockReset()
  useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: 'tok' })
})

describe('usePrFiles', () => {
  it('skips fetching when signed out', () => {
    useRepoGitHub.mockReturnValue({ ownerRepo: { owner: 'org', repo: 'repo' }, token: null })
    renderHook(() => usePrFiles('/repo', 5), { wrapper })
    expect(fetchPrFiles).not.toHaveBeenCalled()
  })

  it('fetches the PR files with owner/repo/number/token', async () => {
    fetchPrFiles.mockResolvedValue([{ filename: 'a.ts', status: 'modified', additions: 1, deletions: 0, changes: 1 }])
    const { result } = renderHook(() => usePrFiles('/repo', 5), { wrapper })
    await waitFor(() => expect(result.current.files).toHaveLength(1))
    expect(fetchPrFiles).toHaveBeenCalledWith('org', 'repo', 5, 'tok')
  })
})
