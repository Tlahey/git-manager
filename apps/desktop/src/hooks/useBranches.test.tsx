import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetBranches: vi.fn() }))

import { apiGetBranches } from '../api/git.api'
import { useBranches } from './useBranches'

const mockedApi = apiGetBranches as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useBranches', () => {
  it('fetches branches when repoPath is set', async () => {
    mockedApi.mockResolvedValue([])
    const { result } = renderHook(() => useBranches('/repo'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('is disabled when repoPath is empty', () => {
    renderHook(() => useBranches(''), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
