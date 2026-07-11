import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetFileRawContents: vi.fn() }))

import { apiGetFileRawContents } from '../api/git.api'
import { useFileRawContents } from './useFileRawContents'

const mockedApi = apiGetFileRawContents as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useFileRawContents', () => {
  it('fetches raw contents when repoPath and filePath are set', async () => {
    mockedApi.mockResolvedValue('file contents')
    const { result } = renderHook(() => useFileRawContents('/repo', 'a.ts', false), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi).toHaveBeenCalledWith('/repo', 'a.ts', false, undefined)
    expect(result.current.data).toBe('file contents')
  })

  it('forwards the oid when given', async () => {
    mockedApi.mockResolvedValue('file contents')
    renderHook(() => useFileRawContents('/repo', 'a.ts', true, 'oid1'), { wrapper })
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('/repo', 'a.ts', true, 'oid1'))
  })

  it('is disabled when filePath is null', () => {
    renderHook(() => useFileRawContents('/repo', null, false), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
