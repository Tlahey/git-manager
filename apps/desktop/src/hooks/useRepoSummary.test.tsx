import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/repo.api', () => ({ apiGetRepoSummary: vi.fn() }))

import { apiGetRepoSummary } from '../api/repo.api'
import { useRepoSummary } from './useRepoSummary'

const mockedApi = apiGetRepoSummary as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRepoSummary', () => {
  it('fetches the repo summary when path is set', async () => {
    mockedApi.mockResolvedValue({ path: '/repo', name: 'repo' })
    const { result } = renderHook(() => useRepoSummary('/repo'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ path: '/repo', name: 'repo' }))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('does not fetch when path is null', () => {
    renderHook(() => useRepoSummary(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
