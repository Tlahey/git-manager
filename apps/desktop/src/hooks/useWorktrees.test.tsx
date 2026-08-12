import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { GitWorktree } from '@git-manager/git-types'

vi.mock('../api/worktree.api', () => ({ apiListWorktrees: vi.fn() }))

import { apiListWorktrees } from '../api/worktree.api'
import { useWorktrees } from './useWorktrees'

const mockedApi = apiListWorktrees as unknown as ReturnType<typeof vi.fn>

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('useWorktrees', () => {
  it('returns the repo worktrees', async () => {
    const worktrees = [{ path: '/repo', branch: 'main', isMain: true } as GitWorktree]
    mockedApi.mockResolvedValue(worktrees)
    const { result } = renderHook(() => useWorktrees('/repo'), { wrapper })
    await waitFor(() => expect(result.current).toEqual(worktrees))
    expect(mockedApi).toHaveBeenCalledWith('/repo')
  })

  it('fetches nothing without a repo, and answers with an empty list', () => {
    const { result } = renderHook(() => useWorktrees(null), { wrapper })
    expect(result.current).toEqual([])
    expect(mockedApi).not.toHaveBeenCalled()
  })

  it('reads the cache the sidebar already filled rather than fetching again', async () => {
    // The point of sharing `['worktrees', path]` with `useSidebarRows`/`BranchContext`: this hook
    // must add no request of its own.
    const seeded = [{ path: '/repo', branch: 'main', isMain: true } as GitWorktree]
    client.setQueryData(['worktrees', '/repo'], seeded)
    const { result } = renderHook(() => useWorktrees('/repo'), { wrapper })
    expect(result.current).toEqual(seeded)
    expect(mockedApi).not.toHaveBeenCalled()
  })
})
