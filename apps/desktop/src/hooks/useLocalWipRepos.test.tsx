import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitStatus } from '@git-manager/git-types'

vi.mock('../api/git.api', () => ({ apiGetRepoStatus: vi.fn() }))

import { apiGetRepoStatus } from '../api/git.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useLocalWipRepos } from './useLocalWipRepos'

const mockedGetRepoStatus = apiGetRepoStatus as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState({ savedRepos: [], repoCache: {} })
})

describe('useLocalWipRepos', () => {
  it('returns only repos with uncommitted changes, with a +/~/− breakdown', async () => {
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/dirty', name: 'dirty', pinned: false },
        { path: '/clean', name: 'clean', pinned: false },
      ],
      repoCache: {
        '/dirty': {
          path: '/dirty',
          name: 'dirty',
          head: 'feature-x',
          isDetached: false,
          isDirty: true,
          remotes: [],
        },
      },
    })
    mockedGetRepoStatus.mockImplementation(async (path: string) =>
      path === '/dirty'
        ? status({ unstaged: [{ path: 'a.ts', status: 'modified' }], untracked: ['b.ts'] })
        : status()
    )

    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })

    await waitFor(() => expect(result.current.wipRepos).toHaveLength(1))
    expect(result.current.wipRepos[0]).toEqual({
      path: '/dirty',
      name: 'dirty',
      head: 'feature-x',
      totalChanges: 2,
      conflicted: 0,
      added: 1,
      modified: 1,
      deleted: 0,
    })
  })

  it('drops a repo whose status read throws', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/gone', name: 'gone', pinned: false }],
      repoCache: {},
    })
    mockedGetRepoStatus.mockRejectedValue(new Error('no such repo'))

    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.wipRepos).toEqual([])
  })

  it('does not fetch when there are no saved repos', () => {
    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })
    expect(mockedGetRepoStatus).not.toHaveBeenCalled()
    expect(result.current.wipRepos).toEqual([])
  })
})
