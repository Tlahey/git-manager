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
    recentRepoPaths: [],
    linkedWorktreePaths: [],
    wipMessages: {},
    hiddenStashes: {},
    hiddenBranches: {},
    hiddenFixups: {},
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

  it('toggleFixupVisibility hides then reveals a fixup oid for a repo, scoped by repo path', () => {
    useRepoDataStore.getState().toggleFixupVisibility('/repo/a', 'fixup-oid-1')
    expect(useRepoDataStore.getState().hiddenFixups['/repo/a']).toEqual(['fixup-oid-1'])
    expect(useRepoDataStore.getState().hiddenFixups['/repo/b']).toBeUndefined()

    useRepoDataStore.getState().toggleFixupVisibility('/repo/a', 'fixup-oid-1')
    expect(useRepoDataStore.getState().hiddenFixups['/repo/a']).toEqual([])
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

describe('useRepoDataStore — recentRepoPaths', () => {
  beforeEach(() => {
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/a', name: 'a' }))
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/b', name: 'b' }))
  })

  it('markRepoOpened puts the repo at the front', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    useRepoDataStore.getState().markRepoOpened('/repo/b')
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/b', '/repo/a'])
  })

  it('markRepoOpened moves an existing entry instead of duplicating it', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    useRepoDataStore.getState().markRepoOpened('/repo/b')
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/a', '/repo/b'])
  })

  it('ignores a path that is not a saved repo (a workspace / linked worktree)', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a/.worktrees/feature')
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual([])
  })

  it('removeRepo also forgets the repo from the recent list', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    useRepoDataStore.getState().removeRepo('/repo/a')
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual([])
  })

  it('is persisted so the New Tab page survives a restart', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    const persisted = JSON.parse(localStorage.getItem('git-manager-repos')!)
    expect(persisted.state.recentRepoPaths).toEqual(['/repo/a'])
  })

  it('forgetRecentRepo drops one entry but keeps the repo saved', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    useRepoDataStore.getState().markRepoOpened('/repo/b')
    useRepoDataStore.getState().forgetRecentRepo('/repo/a')
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual(['/repo/b'])
    expect(useRepoDataStore.getState().savedRepos.map((r) => r.path)).toContain('/repo/a')
  })

  it('forgetRecentRepo can empty the list one entry at a time, keeping repos saved', () => {
    useRepoDataStore.getState().markRepoOpened('/repo/a')
    useRepoDataStore.getState().markRepoOpened('/repo/b')
    for (const path of ['/repo/a', '/repo/b']) {
      useRepoDataStore.getState().forgetRecentRepo(path)
    }
    expect(useRepoDataStore.getState().recentRepoPaths).toEqual([])
    expect(useRepoDataStore.getState().savedRepos).toHaveLength(2)
  })
})

describe('useRepoDataStore — linkedWorktreePaths', () => {
  const WORKTREE = '/repo/a/.worktrees/feature'

  function worktree() {
    return repo({ path: WORKTREE, name: 'feature', mainWorktreePath: '/repo/a' })
  }

  it('records a worktree the user browsed to and saved', () => {
    useRepoDataStore.getState().addRepo(worktree())
    expect(useRepoDataStore.getState().linkedWorktreePaths).toEqual([WORKTREE])
  })

  it('records a worktree the moment its tab caches the repo shape', () => {
    useRepoDataStore.getState().setRepoCache(WORKTREE, worktree())
    expect(useRepoDataStore.getState().linkedWorktreePaths).toEqual([WORKTREE])
  })

  it('does not record a normal repo, whose owner is itself', () => {
    useRepoDataStore.getState().setRepoCache('/repo/a', repo({ mainWorktreePath: '/repo/a' }))
    expect(useRepoDataStore.getState().linkedWorktreePaths).toEqual([])
  })

  it('does not record a snapshot that predates mainWorktreePath', () => {
    useRepoDataStore.getState().setRepoCache('/repo/a', repo())
    expect(useRepoDataStore.getState().linkedWorktreePaths).toEqual([])
  })

  it('does not duplicate a path already recorded', () => {
    useRepoDataStore.getState().setRepoCache(WORKTREE, worktree())
    useRepoDataStore.getState().addRepo(worktree())
    expect(useRepoDataStore.getState().linkedWorktreePaths).toEqual([WORKTREE])
  })

  it('is persisted, so a worktree tab stays identified across a restart', () => {
    // repoCache itself is NOT persisted, which is exactly why this list has to be.
    useRepoDataStore.getState().setRepoCache(WORKTREE, worktree())
    const persisted = JSON.parse(localStorage.getItem('git-manager-repos')!)
    expect(persisted.state.linkedWorktreePaths).toEqual([WORKTREE])
    expect(persisted.state.repoCache).toBeUndefined()
  })
})

describe('useRepoDataStore — setPinned', () => {
  beforeEach(() => {
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/a', name: 'a' }))
    useRepoDataStore.getState().addRepo(repo({ path: '/repo/b', name: 'b' }))
  })

  it('pins a repo without flipping the others', () => {
    useRepoDataStore.getState().setPinned('/repo/a', true)
    const byPath = new Map(useRepoDataStore.getState().savedRepos.map((r) => [r.path, r.pinned]))
    expect(byPath.get('/repo/a')).toBe(true)
    expect(byPath.get('/repo/b')).toBe(false)
  })

  it('is idempotent, unlike togglePin', () => {
    useRepoDataStore.getState().setPinned('/repo/a', true)
    useRepoDataStore.getState().setPinned('/repo/a', true)
    expect(useRepoDataStore.getState().savedRepos.find((r) => r.path === '/repo/a')?.pinned).toBe(
      true
    )
  })

  it('unpins a pinned repo', () => {
    useRepoDataStore.getState().setPinned('/repo/a', true)
    useRepoDataStore.getState().setPinned('/repo/a', false)
    expect(useRepoDataStore.getState().savedRepos.find((r) => r.path === '/repo/a')?.pinned).toBe(
      false
    )
  })

  it('ignores an unknown path', () => {
    useRepoDataStore.getState().setPinned('/repo/missing', true)
    expect(useRepoDataStore.getState().savedRepos.every((r) => !r.pinned)).toBe(true)
  })
})

describe('useRepoDataStore — hidden branches', () => {
  const hidden = (path = '/repo/a') => useRepoDataStore.getState().hiddenBranches[path]

  it('toggles a single branch in and back out of the hidden list', () => {
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'origin/main')
    expect(hidden()).toEqual(['origin/main'])
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'origin/main')
    expect(hidden()).toEqual([])
  })

  // Remote-qualified names: hiding origin/main must leave upstream/main showing.
  // The name is the graph's own: bare for a local branch, qualified for a remote one — which is
  // what keeps `main`, `origin/main` and `upstream/main` three separate entries.
  it('tells apart the local branch and each remote carrying the same name', () => {
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'main')
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'origin/main')
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'upstream/main')
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'origin/main')
    expect(hidden()).toEqual(['main', 'upstream/main'])
  })

  it('is scoped per repository', () => {
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'origin/main')
    expect(hidden('/repo/b')).toBeUndefined()
  })

  it('hides a whole set at once, without duplicating what was already hidden', () => {
    useRepoDataStore.getState().toggleBranchVisibility('/repo/a', 'origin/main')
    useRepoDataStore.getState().setBranchesHidden('/repo/a', ['origin/main', 'origin/dev'], true)
    expect(hidden()).toEqual(['origin/main', 'origin/dev'])
  })

  it('shows a whole set again, leaving the branches outside it hidden', () => {
    useRepoDataStore
      .getState()
      .setBranchesHidden('/repo/a', ['origin/main', 'origin/dev', 'origin/x'], true)
    useRepoDataStore.getState().setBranchesHidden('/repo/a', ['origin/main', 'origin/dev'], false)
    expect(hidden()).toEqual(['origin/x'])
  })
})
