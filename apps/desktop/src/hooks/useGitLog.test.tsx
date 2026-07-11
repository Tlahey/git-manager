import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetLog: vi.fn() }))

import { apiGetLog } from '../api/git.api'
import { useGitLog } from './useGitLog'

const mockedApi = apiGetLog as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useGitLog', () => {
  it('fetches the log with the given options', async () => {
    mockedApi.mockResolvedValue([])
    const opts = { limit: 50, branch: 'main' }
    const { result } = renderHook(() => useGitLog('/repo', opts), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi).toHaveBeenCalledWith('/repo', opts)
  })

  it('is disabled when repoPath is empty', () => {
    renderHook(() => useGitLog(''), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
