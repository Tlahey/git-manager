import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSectionActions, type SectionActions } from './useSectionActions'
import { useRepoDataStore } from '../../../stores/repoData.store'
import { useRepoUIStore } from '../../../stores/repoUI.store'
import type { DashboardSectionId } from '../../../stores/dashboard.store'

const INITIAL_REPO_DATA = useRepoDataStore.getState()
const INITIAL_REPO_UI = useRepoUIStore.getState()

function seed() {
  useRepoDataStore.setState({
    savedRepos: [
      { path: '/repo/a', name: 'a', pinned: true },
      { path: '/repo/b', name: 'b', pinned: true },
    ],
    discoveredRepos: [],
    recentRepoPaths: ['/repo/a', '/repo/b'],
    linkedWorktreePaths: [],
  })
  useRepoUIStore.setState({ openTabs: ['/repo/a', '/repo/b'] })
}

function actions(id: DashboardSectionId): SectionActions {
  return renderHook(() => useSectionActions(id)).result.current
}

beforeEach(() => {
  useRepoDataStore.setState(INITIAL_REPO_DATA, true)
  useRepoUIStore.setState(INITIAL_REPO_UI, true)
  seed()
})

describe('useSectionActions — Open repositories', () => {
  it('leads with "Close repositories"', () => {
    const { lead } = actions('open')
    expect(lead?.label).toBe('Close repositories')
    expect(lead?.destructive).toBe(true)
  })

  it('closes only the tabs it is given', () => {
    const { lead } = actions('open')
    act(() => lead!.run(['/repo/a']))
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/b'])
  })

  it('offers the fetch/pull/editor tools', () => {
    expect(actions('open').showRepoTools).toBe(true)
  })

  it('adds no extra option — it is already the open list', () => {
    expect(actions('open').extraOptions).toEqual([])
  })
})

describe('useSectionActions — Favorites', () => {
  it('has no leading destructive action', () => {
    expect(actions('favorites').lead).toBeNull()
  })

  it('offers the repo tools and an "open all in new tabs" option', () => {
    const { showRepoTools, extraOptions } = actions('favorites')
    expect(showRepoTools).toBe(true)
    expect(extraOptions.map((a) => a.label)).toEqual(['Open all repositories in new tabs'])
  })

  it('opens the given repos in tabs', () => {
    useRepoUIStore.setState({ openTabs: [] })
    const { extraOptions } = actions('favorites')
    act(() => extraOptions[0].run(['/repo/a']))
    expect(useRepoUIStore.getState().openTabs).toContain('/repo/a')
  })
})

describe('useSectionActions — Recent repositories', () => {
  it('leads with "Remove all", which clears the entries it is given', () => {
    const { lead } = actions('recent')
    expect(lead?.label).toBe('Remove all')
    act(() => lead!.run(['/repo/a', '/repo/b']))
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual([])
    // The repos themselves stay saved — only the recency entries go.
    expect(useRepoDataStore.getState().savedRepos).toHaveLength(2)
  })

  it('forgets only the entries it is given, never the whole list', () => {
    // Regression guard: this used to call clearRecentRepos() and ignore its argument, so with rows
    // checked it wiped every recent entry instead of just the selected ones.
    const { lead } = actions('recent')
    act(() => lead!.run(['/repo/a']))
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/b'])
  })

  it('offers the same tools and options as Favorites', () => {
    const recent = actions('recent')
    const favorites = actions('favorites')
    expect(recent.showRepoTools).toBe(favorites.showRepoTools)
    expect(recent.extraOptions.map((a) => a.id)).toEqual(favorites.extraOptions.map((a) => a.id))
  })
})

describe('useSectionActions — All repositories', () => {
  it('exposes no leading action and no repo tools', () => {
    const all = actions('all')
    expect(all.lead).toBeNull()
    // A stray click here would fetch or close every known repo at once.
    expect(all.showRepoTools).toBe(false)
    expect(all.extraOptions).toEqual([])
  })
})
