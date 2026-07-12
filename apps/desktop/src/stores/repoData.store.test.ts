import { describe, it, expect, beforeEach } from 'vitest'
import { useRepoDataStore } from './repoData.store'
import { useRepoUIStore, DASHBOARD_TAB } from './repoUI.store'
import type { GitRepo } from '@git-manager/git-types'

function repo(overrides: Partial<GitRepo> = {}): GitRepo {
  return {
    path: '/repo/a',
    name: 'a',
    head: 'main',
    isDetached: false,
    isDirty: false,
    remotes: [],
    ...overrides,
  }
}

beforeEach(() => {
  useRepoDataStore.setState({
    savedRepos: [],
    repoCache: {},
    discoveredRepos: [],
    wipMessages: {},
    hiddenStashes: {},
  })
  useRepoUIStore.setState({ openTabs: [], activeRepo: null, activeTab: DASHBOARD_TAB })
  localStorage.clear()
})

describe('useRepoDataStore — savedRepos/discoveredRepos', () => {
  it('addRepo adds to both savedRepos and discoveredRepos', () => {
    useRepoDataStore.getState().addRepo(repo())
    const state = useRepoDataStore.getState()
    expect(state.savedRepos).toEqual([{ path: '/repo/a', name: 'a', pinned: false }])
    expect(state.discoveredRepos).toEqual([{ path: '/repo/a', name: 'a' }])
  })

  it('addRepo does not duplicate an already-saved repo', () => {
    useRepoDataStore.getState().addRepo(repo())
    useRepoDataStore.getState().addRepo(repo())
    expect(useRepoDataStore.getState().savedRepos).toHaveLength(1)
    expect(useRepoDataStore.getState().discoveredRepos).toHaveLength(1)
  })

  it('togglePin flips the pinned flag for the matching repo only', () => {
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/a', name: 'a' }))
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/b', name: 'b' }))
    useRepoDataStore.getState().togglePin('/repo/a')
    const saved = useRepoDataStore.getState().savedRepos
    expect(saved.find((r) => r.path === '/repo/a')?.pinned).toBe(true)
    expect(saved.find((r) => r.path === '/repo/b')?.pinned).toBe(false)
  })

  it('addDiscoveredRepo does not duplicate an existing path', () => {
    useRepoDataStore.getState().addDiscoveredRepo('/repo/a', 'a')
    useRepoDataStore.getState().addDiscoveredRepo('/repo/a', 'a')
    expect(useRepoDataStore.getState().discoveredRepos).toHaveLength(1)
  })

  it('removeDiscoveredRepo removes only the matching path', () => {
    useRepoDataStore.getState().addDiscoveredRepo('/repo/a', 'a')
    useRepoDataStore.getState().addDiscoveredRepo('/repo/b', 'b')
    useRepoDataStore.getState().removeDiscoveredRepo('/repo/a')
    expect(useRepoDataStore.getState().discoveredRepos).toEqual([{ path: '/repo/b', name: 'b' }])
  })
})

describe('useRepoDataStore — cache/wip/stash visibility', () => {
  it('setRepoCache stores a repo snapshot by path', () => {
    useRepoDataStore.getState().setRepoCache('/repo/a', repo())
    expect(useRepoDataStore.getState().repoCache['/repo/a']).toEqual(repo())
  })

  it('setWipMessage stores a message per repo path', () => {
    useRepoDataStore.getState().setWipMessage('/repo/a', 'WIP: fix bug')
    expect(useRepoDataStore.getState().wipMessages['/repo/a']).toBe('WIP: fix bug')
  })

  it('toggleStashVisibility hides then reveals a stash oid for a repo', () => {
    useRepoDataStore.getState().toggleStashVisibility('/repo/a', 'stash1')
    expect(useRepoDataStore.getState().hiddenStashes['/repo/a']).toEqual(['stash1'])
    useRepoDataStore.getState().toggleStashVisibility('/repo/a', 'stash1')
    expect(useRepoDataStore.getState().hiddenStashes['/repo/a']).toEqual([])
  })
})

describe('useRepoDataStore — removeRepo cross-store interoperability', () => {
  it('removes the repo from savedRepos', () => {
    useRepoDataStore.getState().addRepo(repo())
    useRepoDataStore.getState().removeRepo('/repo/a')
    expect(useRepoDataStore.getState().savedRepos).toEqual([])
  })

  it("also clears the removed repo out of repoUI.store's open tabs/active state", () => {
    useRepoDataStore.getState().addRepo(repo())
    useRepoUIStore.getState().openTab('/repo/a')
    expect(useRepoUIStore.getState().activeRepo).toBe('/repo/a')

    useRepoDataStore.getState().removeRepo('/repo/a')

    const uiState = useRepoUIStore.getState()
    expect(uiState.openTabs).not.toContain('/repo/a')
    expect(uiState.activeRepo).toBeNull()
    expect(uiState.activeTab).toBe(DASHBOARD_TAB)
  })

  it('does not disturb repoUI state for tabs unrelated to the removed repo', () => {
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/a', name: 'a' }))
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/b', name: 'b' }))
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/b')
    useRepoUIStore.getState().setActiveTab('/repo/b')

    useRepoDataStore.getState().removeRepo('/repo/a')

    const uiState = useRepoUIStore.getState()
    expect(uiState.openTabs).toEqual(['/repo/b'])
    expect(uiState.activeTab).toBe('/repo/b')
    expect(uiState.activeRepo).toBe('/repo/b')
  })
})
