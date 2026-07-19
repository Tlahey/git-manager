import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { WorktreeAgentActivity } from '@git-manager/git-types'

vi.mock('../api/worktree.api', () => ({ apiGetWorktreeAgentActivity: vi.fn() }))

import { apiGetWorktreeAgentActivity } from '../api/worktree.api'
import { useWorktreeAgentActivity } from './useWorktreeAgentActivity'

const mockedGetActivity = apiGetWorktreeAgentActivity as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function activity(overrides: Partial<WorktreeAgentActivity> = {}): WorktreeAgentActivity {
  return {
    path: '/repo-worktree',
    agent: 'claude',
    state: 'working',
    lastActivityMs: 1_700_000_000_000,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useWorktreeAgentActivity', () => {
  it('returns the backend activity for the requested worktrees', async () => {
    const entry = activity()
    mockedGetActivity.mockResolvedValue([entry])

    const { result } = renderHook(() => useWorktreeAgentActivity(['/repo', '/repo-worktree']), {
      wrapper,
    })

    await waitFor(() => expect(result.current).toEqual([entry]))
  })

  it('de-duplicates and sorts the paths passed to the backend', async () => {
    mockedGetActivity.mockResolvedValue([])

    renderHook(() => useWorktreeAgentActivity(['/b', '/a', '/b']), { wrapper })

    await waitFor(() => expect(mockedGetActivity).toHaveBeenCalled())
    expect(mockedGetActivity).toHaveBeenCalledWith(['/a', '/b'])
  })

  it('does not fetch when there are no paths', () => {
    const { result } = renderHook(() => useWorktreeAgentActivity([]), { wrapper })
    expect(mockedGetActivity).not.toHaveBeenCalled()
    expect(result.current).toEqual([])
  })

  it('returns a stable empty array before data arrives', () => {
    mockedGetActivity.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useWorktreeAgentActivity(['/repo']), { wrapper })
    expect(result.current).toEqual([])
  })
})
