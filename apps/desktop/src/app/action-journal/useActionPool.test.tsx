import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

vi.mock('../../api/activityLog.api', () => ({ apiReadActivityLog: vi.fn() }))

import { apiReadActivityLog } from '../../api/activityLog.api'
import { useActionPool } from './useActionPool'
import { ACTIVITY_READ_BUDGET } from '../../lib/actionPool'
import type { ActivityLogEntry } from '../../stores/activityLog.store'

const mockedRead = apiReadActivityLog as unknown as ReturnType<typeof vi.fn>

/** A fresh SWR cache per test — the provider is global otherwise and one test's data leaks. */
function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, refreshInterval: 0 }}>
      {children}
    </SWRConfig>
  )
}

function entry(command: string, id: string, args?: unknown): ActivityLogEntry {
  return { id, timestamp: 1_000, command, durationMs: 4, status: 'ok', args }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedRead.mockResolvedValue([])
})

describe('useActionPool', () => {
  it('reads far more log lines than the actions it will show', async () => {
    renderHook(() => useActionPool(), { wrapper })

    await waitFor(() => expect(mockedRead).toHaveBeenCalledWith(ACTIVITY_READ_BUDGET))
  })

  it('turns the log into actions, dropping the reads', async () => {
    mockedRead.mockResolvedValue([
      entry('get_repo_status', 'r1', { path: '/repo' }),
      entry('stage_file', 'w1', { path: '/repo', filePath: 'a.ts' }),
    ])

    const { result } = renderHook(() => useActionPool(), { wrapper })

    await waitFor(() => expect(result.current.actions).toHaveLength(1))
    expect(result.current.actions[0]?.commands[0]?.lines).toEqual(['git add -- a.ts'])
  })

  it('reports loading only until the first read resolves', async () => {
    const { result } = renderHook(() => useActionPool(), { wrapper })
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it('surfaces a read failure', async () => {
    mockedRead.mockRejectedValue(new Error('log unreadable'))
    const { result } = renderHook(() => useActionPool(), { wrapper })

    await waitFor(() => expect(result.current.error?.message).toBe('log unreadable'))
    expect(result.current.actions).toEqual([])
  })

  it('re-reads the log on demand', async () => {
    const { result } = renderHook(() => useActionPool(), { wrapper })
    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(1))

    result.current.refresh()

    await waitFor(() => expect(mockedRead).toHaveBeenCalledTimes(2))
  })
})
