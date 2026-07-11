import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetRepoStatus: vi.fn() }))

import { apiGetRepoStatus } from '../api/git.api'
import { useGitStatus } from './useGitStatus'

const mockedApi = apiGetRepoStatus as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGitStatus', () => {
  it('fetches repo status when repoPath is set', async () => {
    mockedApi.mockResolvedValue({ staged: [], unstaged: [] })
    const { result } = renderHook(() => useGitStatus('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('is disabled when repoPath is empty', () => {
    renderHook(() => useGitStatus(''), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
