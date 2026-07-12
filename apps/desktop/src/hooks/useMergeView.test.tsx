import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/conflict.api', () => ({ apiGetMergeView: vi.fn() }))

import { apiGetMergeView } from '../api/conflict.api'
import { useMergeView } from './useMergeView'

const mockedApi = apiGetMergeView as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMergeView', () => {
  it('fetches the merge view when repoPath and filePath are set', async () => {
    mockedApi.mockResolvedValue({ blocks: [] })
    const { result } = renderHook(() => useMergeView('/repo', 'a.ts'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ blocks: [] }))
    expect(mockedApi).toHaveBeenCalledWith('/repo', 'a.ts')
  })

  it('does not fetch when filePath is null', () => {
    renderHook(() => useMergeView('/repo', null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })

  it('does not fetch when repoPath is null', () => {
    renderHook(() => useMergeView(null, 'a.ts'), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
