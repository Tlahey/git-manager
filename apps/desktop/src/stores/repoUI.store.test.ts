import { describe, it, expect, beforeEach } from 'vitest'
import { useRepoUIStore, DASHBOARD_TAB } from './repoUI.store'

const INITIAL = {
  openTabs: [] as string[],
  activeRepo: null as string | null,
  activeTab: DASHBOARD_TAB,
  activeDiffFile: null as { path: string; staged: boolean; oid?: string } | null,
  activeLeftPanel: 'sidebar' as const,
  editingOid: null as string | null,
  conflictFilePath: null as string | null,
  pendingGraphSelection: null as string | null,
  selectedCommitOid: null as string | null,
  selectedStashIndex: null as number | null,
  pendingGraphAction: null as ReturnType<
    typeof useRepoUIStore.getState
  >['pendingGraphAction'],
}

beforeEach(() => {
  useRepoUIStore.setState(INITIAL)
  localStorage.clear()
})

describe('useRepoUIStore — tabs', () => {
  it('openTab adds a new tab and makes it active', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    const state = useRepoUIStore.getState()
    expect(state.openTabs).toEqual(['/repo/a'])
    expect(state.activeRepo).toBe('/repo/a')
    expect(state.activeTab).toBe('/repo/a')
  })

  it('openTab does not duplicate an already-open tab', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/a')
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/a'])
  })

  it('closeTab removes the tab and, if it was active, falls back to the previous tab', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/b')
    useRepoUIStore.getState().closeTab('/repo/b')
    const state = useRepoUIStore.getState()
    expect(state.openTabs).toEqual(['/repo/a'])
    expect(state.activeTab).toBe('/repo/a')
    expect(state.activeRepo).toBe('/repo/a')
  })

  it('closeTab falls back to the dashboard when no tabs remain', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().closeTab('/repo/a')
    const state = useRepoUIStore.getState()
    expect(state.openTabs).toEqual([])
    expect(state.activeTab).toBe(DASHBOARD_TAB)
    expect(state.activeRepo).toBeNull()
  })

  it('closeTab leaves the active tab untouched when closing an inactive tab', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/b')
    useRepoUIStore.getState().setActiveTab('/repo/b')
    useRepoUIStore.getState().closeTab('/repo/a')
    const state = useRepoUIStore.getState()
    expect(state.activeTab).toBe('/repo/b')
    expect(state.openTabs).toEqual(['/repo/b'])
  })

  it('reorderTabs moves a tab from one index to another', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/b')
    useRepoUIStore.getState().openTab('/repo/c')
    useRepoUIStore.getState().reorderTabs(0, 2)
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/b', '/repo/c', '/repo/a'])
  })

  it('reorderTabs is a no-op for an out-of-range index', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().reorderTabs(0, 5)
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/a'])
  })
})

describe('useRepoUIStore — active repo/tab selection', () => {
  it('setActiveRepo clears diff/left-panel/conflict state', () => {
    useRepoUIStore.setState({
      activeDiffFile: { path: 'a.ts', staged: false },
      activeLeftPanel: 'blame',
      conflictFilePath: 'b.ts',
    })
    useRepoUIStore.getState().setActiveRepo('/repo/a')
    const state = useRepoUIStore.getState()
    expect(state.activeRepo).toBe('/repo/a')
    expect(state.activeTab).toBe('/repo/a')
    expect(state.activeDiffFile).toBeNull()
    expect(state.activeLeftPanel).toBe('sidebar')
    expect(state.conflictFilePath).toBeNull()
  })

  it('setActiveRepo(null) falls back to the dashboard tab', () => {
    useRepoUIStore.getState().setActiveRepo(null)
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
  })

  it('setActiveTab sets activeRepo only when the tab id is an open repo tab', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().setActiveTab('pull-requests')
    const state = useRepoUIStore.getState()
    expect(state.activeTab).toBe('pull-requests')
    expect(state.activeRepo).toBeNull()
  })

  it('setActiveRepo and setActiveTab clear the selected commit, stash index, and pending graph action', () => {
    useRepoUIStore.setState({
      selectedCommitOid: 'deadbeef',
      selectedStashIndex: 0,
      pendingGraphAction: { kind: 'reset', mode: 'mixed' },
    })
    useRepoUIStore.getState().setActiveRepo('/repo/a')
    expect(useRepoUIStore.getState().selectedCommitOid).toBeNull()
    expect(useRepoUIStore.getState().selectedStashIndex).toBeNull()
    expect(useRepoUIStore.getState().pendingGraphAction).toBeNull()

    useRepoUIStore.setState({
      selectedCommitOid: 'cafef00d',
      selectedStashIndex: 1,
      pendingGraphAction: { kind: 'revert' },
    })
    useRepoUIStore.getState().setActiveTab('pull-requests')
    expect(useRepoUIStore.getState().selectedCommitOid).toBeNull()
    expect(useRepoUIStore.getState().selectedStashIndex).toBeNull()
    expect(useRepoUIStore.getState().pendingGraphAction).toBeNull()
  })

  it('setActiveDiffFile switches to the "blame"/"history" panel only when a file is set', () => {
    useRepoUIStore.getState().setActiveLeftPanel('history')
    useRepoUIStore.getState().setActiveDiffFile({ path: 'a.ts', staged: true })
    expect(useRepoUIStore.getState().activeLeftPanel).toBe('history')

    useRepoUIStore.getState().setActiveDiffFile(null)
    expect(useRepoUIStore.getState().activeLeftPanel).toBe('sidebar')
  })
})

describe('useRepoUIStore — command-palette bridges', () => {
  it('setSelectedCommitOid publishes the selected commit', () => {
    useRepoUIStore.getState().setSelectedCommitOid('abc1234')
    expect(useRepoUIStore.getState().selectedCommitOid).toBe('abc1234')
    useRepoUIStore.getState().setSelectedCommitOid(null)
    expect(useRepoUIStore.getState().selectedCommitOid).toBeNull()
  })

  it('setSelectedStashIndex publishes the selected stash index', () => {
    useRepoUIStore.getState().setSelectedStashIndex(2)
    expect(useRepoUIStore.getState().selectedStashIndex).toBe(2)
    useRepoUIStore.getState().setSelectedStashIndex(null)
    expect(useRepoUIStore.getState().selectedStashIndex).toBeNull()
  })

  it('setPendingGraphAction stores the requested action, then clears it', () => {
    useRepoUIStore.getState().setPendingGraphAction({ kind: 'tag', annotated: true })
    expect(useRepoUIStore.getState().pendingGraphAction).toEqual({ kind: 'tag', annotated: true })
    useRepoUIStore.getState().setPendingGraphAction(null)
    expect(useRepoUIStore.getState().pendingGraphAction).toBeNull()
  })
})

describe('useRepoUIStore — clearTabStateForRemovedRepo', () => {
  it('removes the closed repo from openTabs', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/b')
    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')
    expect(useRepoUIStore.getState().openTabs).toEqual(['/repo/b'])
  })

  it('clears activeRepo when it was the removed repo', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')
    expect(useRepoUIStore.getState().activeRepo).toBeNull()
  })

  it('falls back the active tab to the dashboard when the removed repo was active', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')
    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
  })

  it('leaves activeRepo/activeTab untouched when a different (inactive) repo is removed', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().openTab('/repo/b')
    useRepoUIStore.getState().setActiveTab('/repo/b')
    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')
    const state = useRepoUIStore.getState()
    expect(state.activeRepo).toBe('/repo/b')
    expect(state.activeTab).toBe('/repo/b')
  })
})
