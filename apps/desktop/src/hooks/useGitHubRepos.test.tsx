import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/github.api', () => ({ apiGithubListRepos: vi.fn() }))

import { apiGithubListRepos } from '../api/github.api'
import { useGitHubRepos } from './useGitHubRepos'

const mockedApi = apiGithubListRepos as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGitHubRepos', () => {
  it('fetches repos when a token is set', async () => {
    mockedApi.mockResolvedValue([])
    const { result } = renderHook(() => useGitHubRepos('tok'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(mockedApi).toHaveBeenCalledWith('tok')
  })

  it('does not fetch when token is null', () => {
    renderHook(() => useGitHubRepos(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
