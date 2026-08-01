import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/git.api', () => ({ apiCompareRefs: vi.fn() }))

import { apiCompareRefs } from '../api/git.api'
import { useRefComparison } from './useRefComparison'

const mockedApi = apiCompareRefs as unknown as ReturnType<typeof vi.fn>

const DIFF = { files: [], totalAdditions: 0, totalDeletions: 0 }

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRefComparison', () => {
  it('fetches the diff between the two refs', async () => {
    mockedApi.mockResolvedValue(DIFF)
    const { result } = renderHook(() => useRefComparison('/repo', 'main', 'feature'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe(DIFF))
    expect(mockedApi).toHaveBeenCalledWith('/repo', 'main', 'feature')
  })

  it('does not fetch until both sides are known', () => {
    renderHook(() => useRefComparison('/repo', 'main', null), { wrapper })
    renderHook(() => useRefComparison('/repo', null, 'feature'), { wrapper })
    renderHook(() => useRefComparison(null, 'main', 'feature'), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })

  it('does not fetch a ref against itself', () => {
    renderHook(() => useRefComparison('/repo', 'main', 'main'), { wrapper })
    expect(mockedApi).not.toHaveBeenCalled()
  })

  it('refetches when a side changes', async () => {
    mockedApi.mockResolvedValue(DIFF)
    const { rerender } = renderHook(
      ({ head }: { head: string }) => useRefComparison('/repo', 'main', head),
      { wrapper, initialProps: { head: 'feature' } }
    )
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('/repo', 'main', 'feature'))
    rerender({ head: 'other' })
    await waitFor(() => expect(mockedApi).toHaveBeenCalledWith('/repo', 'main', 'other'))
  })
})
