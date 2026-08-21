import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import type { GitWorktree } from '@git-manager/git-types'

vi.mock('../../../api/worktree.api', () => ({ apiListWorktrees: vi.fn() }))

import { apiListWorktrees } from '../../../api/worktree.api'
import { useWorktreeBranches } from './useWorktreeBranches'

const mockedList = apiListWorktrees as unknown as ReturnType<typeof vi.fn>

function worktree(overrides: Partial<GitWorktree> = {}): GitWorktree {
  return {
    path: '/repo',
    branch: 'main',
    commitOid: 'abc123',
    isMain: true,
    isLocked: false,
    isDirty: false,
    isPrunable: false,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useWorktreeBranches', () => {
  it('names the worktree holding a branch, this repository included', async () => {
    mockedList.mockResolvedValue([
      worktree({ path: '/repo', branch: 'card/exporter' }),
      worktree({ path: '/repo.worktrees/feature/x', branch: 'feature/x', isMain: false }),
    ])

    const { result } = renderHook(() => useWorktreeBranches('/repo'), { wrapper })

    await waitFor(() => expect(result.current.worktreeHolding('card/exporter')?.path).toBe('/repo'))
    expect(result.current.worktreeHolding('feature/x')?.path).toBe('/repo.worktrees/feature/x')
    expect(mockedList).toHaveBeenCalledWith('/repo')
  })

  it('answers null for a branch no worktree holds', async () => {
    mockedList.mockResolvedValue([worktree({ branch: 'main' })])

    const { result } = renderHook(() => useWorktreeBranches('/repo'), { wrapper })

    await waitFor(() => expect(result.current.worktreeHolding('main')).not.toBeNull())
    expect(result.current.worktreeHolding('card/exporter')).toBeNull()
  })

  // A card with no branch yet is the ordinary first state of the section that asks this, so it is
  // answered rather than guarded against at every call site.
  it('answers null for no branch at all', async () => {
    mockedList.mockResolvedValue([worktree()])

    const { result } = renderHook(() => useWorktreeBranches('/repo'), { wrapper })

    expect(result.current.worktreeHolding(undefined)).toBeNull()
    expect(result.current.worktreeHolding(null)).toBeNull()
  })

  // Before the first read resolves there is nothing to say, and saying "no worktree holds it" would
  // be a claim rather than an absence — the section only ever uses a hit, never a miss.
  it('answers null while the list is still loading', () => {
    mockedList.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useWorktreeBranches('/repo'), { wrapper })

    expect(result.current.worktreeHolding('main')).toBeNull()
  })

  it('asks for nothing without a repository', () => {
    renderHook(() => useWorktreeBranches(''), { wrapper })

    expect(mockedList).not.toHaveBeenCalled()
  })

  /**
   * The read has to be repeatable on demand, because the event that changes its answer is one this
   * app performs: creating a card's branch checks it out, and from that moment the branch is held by
   * this very worktree. Waiting for the next mount would leave the section wrong precisely while it
   * is being read.
   */
  it('re-reads the list on demand, with the answer it gives changing', async () => {
    mockedList.mockResolvedValue([worktree({ path: '/repo', branch: 'main' })])

    const { result } = renderHook(() => useWorktreeBranches('/repo'), { wrapper })
    await waitFor(() => expect(result.current.worktreeHolding('main')?.path).toBe('/repo'))
    expect(result.current.worktreeHolding('card/exporter')).toBeNull()

    mockedList.mockResolvedValue([worktree({ path: '/repo', branch: 'card/exporter' })])
    await act(async () => {
      result.current.revalidateWorktrees()
    })

    await waitFor(() => expect(result.current.worktreeHolding('card/exporter')?.path).toBe('/repo'))
    expect(mockedList).toHaveBeenCalledTimes(2)
  })
})
