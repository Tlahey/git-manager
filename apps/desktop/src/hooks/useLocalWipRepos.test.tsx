import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitStatus, GitWorktree } from '@git-manager/git-types'

vi.mock('../api/git.api', () => ({ apiGetRepoStatus: vi.fn() }))
vi.mock('../api/worktree.api', () => ({ apiListWorktrees: vi.fn() }))

import { apiGetRepoStatus } from '../api/git.api'
import { apiListWorktrees } from '../api/worktree.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useLocalWipRepos } from './useLocalWipRepos'

const mockedGetRepoStatus = apiGetRepoStatus as unknown as ReturnType<typeof vi.fn>
const mockedListWorktrees = apiListWorktrees as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/repo',
    branch: 'main',
    commitOid: 'abc',
    isMain: true,
    isLocked: false,
    isDirty: true,
    isPrunable: false,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useRepoDataStore.setState({ savedRepos: [], repoCache: {} })
})

describe('useLocalWipRepos', () => {
  it('returns one entry per dirty worktree (main + linked branches)', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/repo', name: 'my-repo', pinned: false }],
      repoCache: {},
    })
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/repo-feat', branch: 'feature-x', isMain: false }),
    ])
    mockedGetRepoStatus.mockImplementation(async (path: string) =>
      path === '/repo'
        ? status({ unstaged: [{ path: 'a.ts', status: 'modified' }] })
        : status({ untracked: ['b.ts'] })
    )

    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })

    await waitFor(() => expect(result.current.entries).toHaveLength(2))
    expect(result.current.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repoPath: '/repo',
          worktreePath: '/repo',
          repoName: 'my-repo',
          branch: 'main',
          isMainWorktree: true,
          totalChanges: 1,
          modified: 1,
        }),
        expect.objectContaining({
          worktreePath: '/repo-feat',
          branch: 'feature-x',
          isMainWorktree: false,
          totalChanges: 1,
          added: 1,
        }),
      ])
    )
  })

  it('drops clean worktrees', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/repo', name: 'my-repo', pinned: false }],
      repoCache: {},
    })
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/repo-clean', branch: 'clean', isMain: false }),
    ])
    mockedGetRepoStatus.mockImplementation(async (path: string) =>
      path === '/repo' ? status({ untracked: ['x'] }) : status()
    )

    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })

    await waitFor(() => expect(result.current.entries).toHaveLength(1))
    expect(result.current.entries[0].worktreePath).toBe('/repo')
  })

  it('drops a repo whose worktree listing throws', async () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: '/gone', name: 'gone', pinned: false }],
      repoCache: {},
    })
    mockedListWorktrees.mockRejectedValue(new Error('no such repo'))

    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.entries).toEqual([])
  })

  it('does not fetch when there are no saved repos', () => {
    const { result } = renderHook(() => useLocalWipRepos(), { wrapper })
    expect(mockedListWorktrees).not.toHaveBeenCalled()
    expect(result.current.entries).toEqual([])
  })
})
