import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRecentRepos } from './useRecentRepos'
import { useRepoDataStore } from '../stores/repoData.store'

function saved(path: string, name: string) {
  return { path, name, pinned: false }
}

beforeEach(() => {
  useRepoDataStore.setState({ savedRepos: [], recentRepoPaths: [] })
  localStorage.clear()
})

describe('useRecentRepos', () => {
  it('lists most-recently-opened repos first', () => {
    useRepoDataStore.setState({
      savedRepos: [saved('/repo/a', 'alpha'), saved('/repo/b', 'beta')],
      recentRepoPaths: ['/repo/b', '/repo/a'],
    })
    const { result } = renderHook(() => useRecentRepos())
    expect(result.current).toEqual([
      { path: '/repo/b', name: 'beta' },
      { path: '/repo/a', name: 'alpha' },
    ])
  })

  it('appends saved repos that were never opened, without duplicating the recent ones', () => {
    useRepoDataStore.setState({
      savedRepos: [saved('/repo/a', 'alpha'), saved('/repo/b', 'beta')],
      recentRepoPaths: ['/repo/b'],
    })
    const { result } = renderHook(() => useRecentRepos())
    expect(result.current.map((r) => r.path)).toEqual(['/repo/b', '/repo/a'])
  })

  it('skips a recently opened path that is not a saved repo (a workspace/linked worktree)', () => {
    useRepoDataStore.setState({
      savedRepos: [saved('/repo/a', 'alpha')],
      recentRepoPaths: ['/repo/a/.worktrees/feature', '/repo/a'],
    })
    const { result } = renderHook(() => useRecentRepos())
    expect(result.current).toEqual([{ path: '/repo/a', name: 'alpha' }])
  })

  it('lists at most 5 repos by default', () => {
    const repos = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((n) => saved(`/repo/${n}`, n))
    useRepoDataStore.setState({
      savedRepos: repos,
      recentRepoPaths: repos.map((r) => r.path),
    })
    const { result } = renderHook(() => useRecentRepos())
    expect(result.current.map((r) => r.name)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('honours an explicit limit', () => {
    useRepoDataStore.setState({
      savedRepos: [saved('/repo/a', 'a'), saved('/repo/b', 'b'), saved('/repo/c', 'c')],
      recentRepoPaths: ['/repo/a', '/repo/b', '/repo/c'],
    })
    const { result } = renderHook(() => useRecentRepos(2))
    expect(result.current.map((r) => r.path)).toEqual(['/repo/a', '/repo/b'])
  })

  it('is empty when nothing is known', () => {
    const { result } = renderHook(() => useRecentRepos())
    expect(result.current).toEqual([])
  })
})
