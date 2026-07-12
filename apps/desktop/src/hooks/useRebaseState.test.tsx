import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiGetRebaseState: vi.fn() }))

import { apiGetRebaseState } from '../api/git.api'
import { useRebaseState } from './useRebaseState'

const mockedApi = apiGetRebaseState as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRebaseState', () => {
  it('fetches the rebase state when repoPath is set', async () => {
    mockedApi.mockResolvedValue({ kind: 'idle' })
    const { result } = renderHook(() => useRebaseState('/repo'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ kind: 'idle' }))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('does not fetch when repoPath is null', () => {
    renderHook(() => useRebaseState(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
