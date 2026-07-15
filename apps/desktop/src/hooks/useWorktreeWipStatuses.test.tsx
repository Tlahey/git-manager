import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitStatus, GitWorktree } from '@git-manager/git-types'

vi.mock('../api/worktree.api', () => ({ apiListWorktrees: vi.fn() }))
vi.mock('../api/git.api', () => ({ apiGetRepoStatus: vi.fn() }))

import { apiListWorktrees } from '../api/worktree.api'
import { apiGetRepoStatus } from '../api/git.api'
import { useWorktreeWipStatuses } from './useWorktreeWipStatuses'

const mockedListWorktrees = apiListWorktrees as unknown as ReturnType<typeof vi.fn>
const mockedGetRepoStatus = apiGetRepoStatus as unknown as ReturnType<typeof vi.fn>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/repo-worktree',
    branch: 'feature-x',
    commitOid: 'abc123',
    isMain: false,
    isLocked: false,
    isDirty: true,
    isPrunable: false,
    ...overrides,
  }
}

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return { staged: [], unstaged: [], untracked: [], conflicted: [], ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useWorktreeWipStatuses', () => {
  it('returns a WIP status for a linked worktree with changes', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/repo-worktree', branch: 'feature-x' }),
    ])
    mockedGetRepoStatus.mockResolvedValue(status({ unstaged: [{ path: 'a.ts', status: 'modified' }] }))

    const { result } = renderHook(() => useWorktreeWipStatuses('/repo'), { wrapper })

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { path: '/repo-worktree', branch: 'feature-x', totalChanges: 1 },
      ])
    )
    expect(mockedGetRepoStatus).toHaveBeenCalledWith('/repo-worktree')
    expect(mockedGetRepoStatus).not.toHaveBeenCalledWith('/repo')
  })

  it('excludes the main worktree, the active repo path, detached HEADs, and clean worktrees', async () => {
    mockedListWorktrees.mockResolvedValue([
      worktree({ path: '/repo', branch: 'main', isMain: true }),
      worktree({ path: '/repo', branch: 'main', isMain: false }), // same path as active repo
      worktree({ path: '/repo-detached', branch: '(detached HEAD)' }),
      worktree({ path: '/repo-clean', branch: 'clean-branch' }),
    ])
    mockedGetRepoStatus.mockResolvedValue(status())

    const { result } = renderHook(() => useWorktreeWipStatuses('/repo'), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(mockedGetRepoStatus).toHaveBeenCalledWith('/repo-clean')
    expect(mockedGetRepoStatus).not.toHaveBeenCalledWith('/repo-detached')
  })

  it('does not fetch when repoPath is empty', () => {
    renderHook(() => useWorktreeWipStatuses(''), { wrapper })
    expect(mockedListWorktrees).not.toHaveBeenCalled()
  })
})
