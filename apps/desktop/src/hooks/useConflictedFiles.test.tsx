import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/conflict.api', () => ({ apiListConflictedFiles: vi.fn() }))

import { apiListConflictedFiles } from '../api/conflict.api'
import { useConflictedFiles } from './useConflictedFiles'

const mockedApi = apiListConflictedFiles as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useConflictedFiles', () => {
  it('fetches conflicted files when repoPath is set', async () => {
    mockedApi.mockResolvedValue(['a.ts'])
    const { result } = renderHook(() => useConflictedFiles('/repo'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(['a.ts']))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('does not fetch when repoPath is null', () => {
    renderHook(() => useConflictedFiles(null), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
