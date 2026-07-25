import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOpenRepoTab } from './useOpenRepoTab'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore, DASHBOARD_TAB } from '../stores/repoUI.store'

function saved(path: string) {
  return { path, name: path.split('/').pop()!, pinned: false }
}

beforeEach(() => {
  useRepoUIStore.setState({ openTabs: [], activeTab: DASHBOARD_TAB, activeRepo: null })
  useRepoDataStore.setState({ savedRepos: [], recentRepoPaths: [] })
  localStorage.clear()
})

describe('useOpenRepoTab', () => {
  it('opens the repo as a tab and records it as most recently opened', () => {
    useRepoDataStore.setState({ savedRepos: [saved('/repo/a')] })
    const { result } = renderHook(() => useOpenRepoTab())
    act(() => result.current('/repo/a'))

    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/a'])
    expect(useRepoUIStore.getState().activeRepo).toBe('/repo/a')
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/a'])
  })

  it('moves an already-recent repo back to the front instead of duplicating it', () => {
    useRepoDataStore.setState({ savedRepos: [saved('/repo/a'), saved('/repo/b')] })
    const { result } = renderHook(() => useOpenRepoTab())
    act(() => result.current('/repo/a'))
    act(() => result.current('/repo/b'))
    act(() => result.current('/repo/a'))

    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/a', '/repo/b'])
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/a', '/repo/b'])
  })

  it('caps the recent list at 20 entries, dropping the oldest', () => {
    const paths = Array.from({ length: 25 }, (_, i) => `/repo/${i}`)
    useRepoDataStore.setState({ savedRepos: paths.map(saved) })
    const { result } = renderHook(() => useOpenRepoTab())
    for (const path of paths) {
      act(() => result.current(path))
    }
    const recent = useRepoDataStore.getState().recentRepoPaths
    expect(recent).toHaveLength(20)
    expect(recent[0]).toBe('/repo/24')
    expect(recent).not.toContain('/repo/4')
  })

  it('opens a workspace (linked worktree) as a tab without recording it as a recent repo', () => {
    useRepoDataStore.setState({ savedRepos: [saved('/repo/a')] })
    const { result } = renderHook(() => useOpenRepoTab())
    act(() => result.current('/repo/a/.worktrees/feature'))

    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/a/.worktrees/feature'])
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual([])
  })
})
