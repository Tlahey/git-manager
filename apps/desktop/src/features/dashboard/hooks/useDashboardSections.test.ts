import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDashboardSections } from './useDashboardSections'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore, DASHBOARD_TAB, PULL_REQUESTS_TAB } from '../../../stores/repoUI.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

function paths(list: { path: string }[]) {
  return list.map((r) => r.path)
}

beforeEach(() => {
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  useRepoDataStore.setState({
    savedRepos: [
      { path: '/repo/alpha', name: 'alpha', pinned: true },
      { path: '/repo/beta', name: 'beta', pinned: false },
    ],
    discoveredRepos: [{ path: '/repo/gamma', name: 'gamma' }],
    recentRepoPaths: ['/repo/beta', '/repo/alpha'],
  })
  useRepoUIStore.setState({ openTabs: ['/repo/alpha'] })
})

describe('useDashboardSections — section contents', () => {
  it('lists the repos open in tabs', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.open)).toEqual(['/repo/alpha'])
  })

  it('excludes the dashboard, pull-requests and empty New Tab pseudo-tabs', () => {
    useRepoUIStore.setState({
      openTabs: [DASHBOARD_TAB, PULL_REQUESTS_TAB, 'new-tab:1', '/repo/alpha'],
    })
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.open)).toEqual(['/repo/alpha'])
  })

  it('lists only pinned repos as favorites', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.favorites)).toEqual(['/repo/alpha'])
  })

  it('lists recents most-recently-opened first', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.recent)).toEqual(['/repo/beta', '/repo/alpha'])
  })

  it('drops recency entries whose repo is no longer saved', () => {
    useRepoDataStore.setState({ recentRepoPaths: ['/repo/deleted', '/repo/alpha'] })
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.recent)).toEqual(['/repo/alpha'])
  })

  it('unions saved and discovered repos, without duplicates', () => {
    useRepoDataStore.setState({
      discoveredRepos: [
        { path: '/repo/gamma', name: 'gamma' },
        { path: '/repo/alpha', name: 'stale-name' },
      ],
    })
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.all).sort()).toEqual(['/repo/alpha', '/repo/beta', '/repo/gamma'])
    expect(result.current.all.find((r) => r.path === '/repo/alpha')?.name).toBe('alpha')
  })
})

describe('useDashboardSections — filtering', () => {
  it('filters every section by name', () => {
    const { result } = renderHook(() => useDashboardSections('alpha'))
    expect(paths(result.current.all)).toEqual(['/repo/alpha'])
    expect(paths(result.current.recent)).toEqual(['/repo/alpha'])
    expect(paths(result.current.favorites)).toEqual(['/repo/alpha'])
    expect(paths(result.current.open)).toEqual(['/repo/alpha'])
  })

  it('filters by path too, case-insensitively', () => {
    const { result } = renderHook(() => useDashboardSections('GAMMA'))
    expect(paths(result.current.all)).toEqual(['/repo/gamma'])
  })

  it('keeps totalKnownCount unfiltered so a no-match search does not trigger the empty state', () => {
    const { result } = renderHook(() => useDashboardSections('nothing-matches-this'))
    expect(paths(result.current.all)).toEqual([])
    expect(result.current.totalKnownCount).toBe(3)
  })

  it('reports zero known repos when the store is empty', () => {
    useRepoDataStore.setState({ savedRepos: [], discoveredRepos: [], recentRepoPaths: [] })
    const { result } = renderHook(() => useDashboardSections(''))
    expect(result.current.totalKnownCount).toBe(0)
  })
})

describe('useDashboardSections — linked worktrees are not repositories', () => {
  const WORKTREE = '/repo/alpha/.worktrees/feature'

  beforeEach(() => {
    useRepoDataStore.setState({
      savedRepos: [
        { path: '/repo/alpha', name: 'alpha', pinned: true },
        { path: WORKTREE, name: 'feature', pinned: true },
      ],
      discoveredRepos: [{ path: WORKTREE, name: 'feature' }],
      recentRepoPaths: [WORKTREE, '/repo/alpha'],
      linkedWorktreePaths: [WORKTREE],
    })
    useRepoUIStore.setState({ openTabs: [WORKTREE, '/repo/alpha'] })
  })

  it('hides a worktree open in a tab', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.open)).toEqual(['/repo/alpha'])
  })

  it('hides a worktree that was saved and pinned', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.favorites)).toEqual(['/repo/alpha'])
  })

  it('hides a worktree from the recent list', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.recent)).toEqual(['/repo/alpha'])
  })

  it('hides a worktree discovered by a folder scan', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.all)).toEqual(['/repo/alpha'])
  })

  it('does not count worktrees as known repositories', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(result.current.totalKnownCount).toBe(1)
  })

  it('falls back to the empty state when every entry is a worktree', () => {
    useRepoDataStore.setState({
      savedRepos: [{ path: WORKTREE, name: 'feature', pinned: false }],
      discoveredRepos: [],
      recentRepoPaths: [],
    })
    const { result } = renderHook(() => useDashboardSections(''))
    expect(result.current.totalKnownCount).toBe(0)
  })

  it('keeps the owning repository visible even when its worktree is open', () => {
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.all)).toContain('/repo/alpha')
  })

  it('shows a path again once it is no longer known to be a worktree', () => {
    useRepoDataStore.setState({ linkedWorktreePaths: [] })
    const { result } = renderHook(() => useDashboardSections(''))
    expect(paths(result.current.open)).toEqual([WORKTREE, '/repo/alpha'])
  })
})
