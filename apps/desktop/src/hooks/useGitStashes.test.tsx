import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiStashList: vi.fn() }))

import { apiStashList } from '../api/git.api'
import { useGitStashes } from './useGitStashes'

const mockedApi = apiStashList as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGitStashes', () => {
  it('fetches stashes when repoPath is set', async () => {
    mockedApi.mockResolvedValue([])
    const { result } = renderHook(() => useGitStashes('/repo'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('does not fetch when repoPath is null', () => {
    renderHook(() => useGitStashes(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
