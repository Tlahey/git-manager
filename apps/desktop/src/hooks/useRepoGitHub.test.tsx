import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'
import { RepoGitHubOverrideContext, useRepoGitHub, type OwnerRepo } from './useRepoGitHub'

const { apiGetRemotes } = vi.hoisted(() => ({ apiGetRemotes: vi.fn() }))
vi.mock('../api/git.api', () => ({ apiGetRemotes }))

// Isolate SWR's cache per render so keyed lookups can't bleed between tests.
function wrapper(override: OwnerRepo | null) {
  return ({ children }: { children: ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map() }}>
      <RepoGitHubOverrideContext.Provider value={override}>
        {children}
      </RepoGitHubOverrideContext.Provider>
    </SWRConfig>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useRepoGitHub', () => {
  it('uses the override owner/repo and never looks up the local remotes', () => {
    const { result } = renderHook(() => useRepoGitHub('owner/repo'), {
      wrapper: wrapper({ owner: 'acme', repo: 'widgets' }),
    })
    expect(result.current.ownerRepo).toEqual({ owner: 'acme', repo: 'widgets' })
    expect(apiGetRemotes).not.toHaveBeenCalled()
  })

  it('resolves owner/repo from the repo remotes when there is no override', async () => {
    apiGetRemotes.mockResolvedValue([{ name: 'origin', url: 'https://github.com/foo/bar.git' }])
    const { result } = renderHook(() => useRepoGitHub('/local/path'), {
      wrapper: wrapper(null),
    })
    await waitFor(() => expect(result.current.ownerRepo).toEqual({ owner: 'foo', repo: 'bar' }))
    expect(apiGetRemotes).toHaveBeenCalledWith('/local/path')
  })

  it('does not fetch remotes for a null repo path', () => {
    const { result } = renderHook(() => useRepoGitHub(null), { wrapper: wrapper(null) })
    expect(result.current.ownerRepo).toBeNull()
    expect(apiGetRemotes).not.toHaveBeenCalled()
  })
})
