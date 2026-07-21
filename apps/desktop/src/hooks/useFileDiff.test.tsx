import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetFileDiff: vi.fn() }))

import { apiGetFileDiff } from '../api/git.api'
import { useFileDiff } from './useFileDiff'

const mockedApi = apiGetFileDiff as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFileDiff', () => {
  it('fetches the file diff when repoPath and filePath are set', async () => {
    mockedApi.mockResolvedValue({ hunks: [] })
    const { result } = renderHook(() => useFileDiff('/repo', 'a.ts', false), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi).toHaveBeenCalledWith('/repo', 'a.ts', false, undefined, undefined)
    expect(result.current.data).toEqual({ hunks: [] })
  })

  it('forwards the oid when given', async () => {
    mockedApi.mockResolvedValue({ hunks: [] })
    renderHook(() => useFileDiff('/repo', 'a.ts', true, 'oid1'), { wrapper })
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith('/repo', 'a.ts', true, 'oid1', undefined)
    )
  })

  it('forwards the merged-range base oid when given', async () => {
    mockedApi.mockResolvedValue({ hunks: [] })
    renderHook(() => useFileDiff('/repo', 'a.ts', false, 'head', 'base'), { wrapper })
    await waitFor(() =>
      expect(mockedApi).toHaveBeenCalledWith('/repo', 'a.ts', false, 'head', 'base')
    )
  })

  it('is disabled (does not fetch) when filePath is null', () => {
    renderHook(() => useFileDiff('/repo', null, false), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })

  it('is disabled when repoPath is empty', () => {
    renderHook(() => useFileDiff('', 'a.ts', false), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
