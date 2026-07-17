import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { GitRepo } from '@git-manager/git-types'
import { useRepoDataStore } from '../stores/repoData.store'
import { useCanonicalRepoPath } from './useCanonicalRepoPath'

function repo(path: string, mainWorktreePath?: string): GitRepo {
  return {
    path,
    name: path.split('/').pop() ?? path,
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    mainWorktreePath,
  }
}

beforeEach(() => {
  useRepoDataStore.setState({ repoCache: {} })
})

describe('useCanonicalRepoPath', () => {
  it('returns null for a null path', () => {
    const { result } = renderHook(() => useCanonicalRepoPath(null))
    expect(result.current).toBeNull()
  })

  it('falls back to the given path when the repo is not cached', () => {
    const { result } = renderHook(() => useCanonicalRepoPath('/repo/wt'))
    expect(result.current).toBe('/repo/wt')
  })

  it('resolves a linked worktree to its owning repo (main worktree)', () => {
    useRepoDataStore.setState({
      repoCache: { '/repo/.wt/feature': repo('/repo/.wt/feature', '/repo') },
    })
    const { result } = renderHook(() => useCanonicalRepoPath('/repo/.wt/feature'))
    expect(result.current).toBe('/repo')
  })

  it('leaves a main repo pointing at itself', () => {
    useRepoDataStore.setState({ repoCache: { '/repo': repo('/repo', '/repo') } })
    const { result } = renderHook(() => useCanonicalRepoPath('/repo'))
    expect(result.current).toBe('/repo')
  })

  it('falls back to the path when a cached snapshot lacks mainWorktreePath', () => {
    useRepoDataStore.setState({ repoCache: { '/repo': repo('/repo', undefined) } })
    const { result } = renderHook(() => useCanonicalRepoPath('/repo'))
    expect(result.current).toBe('/repo')
  })
})
