import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/repo.api', () => ({ apiGetRepoReadme: vi.fn() }))

import { apiGetRepoReadme } from '../api/repo.api'
import { useRepoReadme } from './useRepoReadme'

const mockedApi = apiGetRepoReadme as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRepoReadme', () => {
  it('fetches the readme when path is set', async () => {
    mockedApi.mockResolvedValue('# Readme')
    const { result } = renderHook(() => useRepoReadme('/repo'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('# Readme'))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('does not fetch when path is null', () => {
    renderHook(() => useRepoReadme(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
