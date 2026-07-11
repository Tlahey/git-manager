import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetCommitDiff: vi.fn() }))

import { apiGetCommitDiff } from '../api/git.api'
import { useCommitDiff } from './useCommitDiff'

const mockedApi = apiGetCommitDiff as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useCommitDiff', () => {
  it('fetches the commit diff when repoPath and oid are set', async () => {
    mockedApi.mockResolvedValue({ hunks: [] })
    const { result } = renderHook(() => useCommitDiff('/repo', 'oid1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi).toHaveBeenCalledWith('/repo', 'oid1')
  })

  it('is disabled when oid is null', () => {
    renderHook(() => useCommitDiff('/repo', null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
