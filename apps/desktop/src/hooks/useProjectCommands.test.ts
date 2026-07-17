import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { createElement, type ReactNode } from 'react'

vi.mock('../api/shell.api', () => ({ apiGetProjectCommands: vi.fn() }))

import { apiGetProjectCommands } from '../api/shell.api'
import { useProjectCommands } from './useProjectCommands'

const mockedApi = apiGetProjectCommands as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return createElement(SWRConfig, { value: { provider: () => new Map(), dedupingInterval: 0 } }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useProjectCommands', () => {
  it('returns the project commands for a repo', async () => {
    const commands = [{ name: 'dev', command: 'pnpm dev', detail: 'vite', source: 'package.json' }]
    mockedApi.mockResolvedValue(commands)
    const { result } = renderHook(() => useProjectCommands('/repo'), { wrapper })
    await waitFor(() => expect(result.current).toEqual(commands))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('returns an empty list and does not fetch when no repo is open', () => {
    const { result } = renderHook(() => useProjectCommands(null), { wrapper })
    expect(result.current).toEqual([])
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
