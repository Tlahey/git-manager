import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../api/theme.api', () => ({ apiGetUserThemes: vi.fn() }))

import { apiGetUserThemes } from '../api/theme.api'
import { useUserThemes } from './useUserThemes'

const mockedApi = apiGetUserThemes as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useUserThemes', () => {
  it('fetches user themes unconditionally', async () => {
    mockedApi.mockResolvedValue([{ id: 'custom-1' }])
    const { result } = renderHook(() => useUserThemes(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'custom-1' }]))
    expect(mockedApi).toHaveBeenCalledOnce()
  })
})
