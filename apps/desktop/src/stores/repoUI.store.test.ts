import { describe, it, expect, beforeEach } from 'vitest'
import { useRepoUIStore, DASHBOARD_TAB } from './repoUI.store'

const INITIAL = {
  openTabs: [] as string[],
  activeRepo: null as string | null,
  activeTab: DASHBOARD_TAB,
  activeDiffFile: null as { path: string; staged: boolean; oid?: string } | null,
  activePrNumber: null as number | null,
  activePrFile: null as string | null,
  prFilesVisible: true,
  prComposer: null as ReturnType<typeof useRepoUIStore.getState>['prComposer'],
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

describe('useRepoUIStore — activePrNumber', () => {
  it('sets and clears the active PR number', () => {
    useRepoUIStore.getState().setActivePrNumber(42)
    expect(useRepoUIStore.getState().activePrNumber).toBe(42)
    useRepoUIStore.getState().setActivePrNumber(null)
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  it('opening a PR clears any open file diff (mutually exclusive center panels)', () => {
    useRepoUIStore.getState().setActiveDiffFile({ path: 'a.ts', staged: false })
    useRepoUIStore.getState().setActivePrNumber(7)
    expect(useRepoUIStore.getState().activeDiffFile).toBeNull()
    expect(useRepoUIStore.getState().activePrNumber).toBe(7)
  })

  it('opening a file diff clears any active PR view', () => {
    useRepoUIStore.getState().setActivePrNumber(7)
    useRepoUIStore.getState().setActiveDiffFile({ path: 'a.ts', staged: false })
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
    expect(useRepoUIStore.getState().activeDiffFile).toEqual({ path: 'a.ts', staged: false })
  })

  it('is reset by setActiveRepo and setActiveTab', () => {
    useRepoUIStore.getState().setActivePrNumber(7)
    useRepoUIStore.getState().setActiveRepo('/repo/a')
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()

    useRepoUIStore.getState().setActivePrNumber(9)
    useRepoUIStore.getState().setActiveTab('pull-requests')
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })

  it('is cleared when the active repo tab is removed', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().setActivePrNumber(11)
    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')
    expect(useRepoUIStore.getState().activePrNumber).toBeNull()
  })
})

describe('useRepoUIStore — activePrFile', () => {
  it('sets and clears the selected PR file', () => {
    useRepoUIStore.getState().setActivePrFile('src/a.ts')
    expect(useRepoUIStore.getState().activePrFile).toBe('src/a.ts')
    useRepoUIStore.getState().setActivePrFile(null)
    expect(useRepoUIStore.getState().activePrFile).toBeNull()
  })

  it('is reset whenever the active PR changes or closes', () => {
    useRepoUIStore.getState().setActivePrNumber(7)
    useRepoUIStore.getState().setActivePrFile('src/a.ts')
    // Switching to another PR resets the selected file.
    useRepoUIStore.getState().setActivePrNumber(8)
    expect(useRepoUIStore.getState().activePrFile).toBeNull()

    useRepoUIStore.getState().setActivePrFile('src/b.ts')
    // Closing the PR view resets it too.
    useRepoUIStore.getState().setActivePrNumber(null)
    expect(useRepoUIStore.getState().activePrFile).toBeNull()
  })

  it('is cleared when a file diff or the composer takes the center panel', () => {
    useRepoUIStore.getState().setActivePrNumber(7)
    useRepoUIStore.getState().setActivePrFile('src/a.ts')
    useRepoUIStore.getState().setActiveDiffFile({ path: 'x.ts', staged: false })
    expect(useRepoUIStore.getState().activePrFile).toBeNull()
  })
})

describe('useRepoUIStore — prFilesVisible', () => {
  it('defaults to visible and toggles', () => {
    expect(useRepoUIStore.getState().prFilesVisible).toBe(true)
    useRepoUIStore.getState().togglePrFiles()
    expect(useRepoUIStore.getState().prFilesVisible).toBe(false)
    useRepoUIStore.getState().togglePrFiles()
    expect(useRepoUIStore.getState().prFilesVisible).toBe(true)
  })
})

describe('useRepoUIStore — prComposer', () => {
  const composer = { head: 'feat/x', baseRef: 'main', title: 'feat: x' }

  it('sets and clears the PR composer', () => {
    useRepoUIStore.getState().setPrComposer(composer)
    expect(useRepoUIStore.getState().prComposer).toEqual(composer)
    useRepoUIStore.getState().setPrComposer(null)
    expect(useRepoUIStore.getState().prComposer).toBeNull()
  })

  it('opening the composer clears any open file diff and PR view (mutually exclusive)', () => {
    useRepoUIStore.getState().setActiveDiffFile({ path: 'a.ts', staged: false })
    useRepoUIStore.getState().setActivePrNumber(7)
    useRepoUIStore.getState().setPrComposer(composer)
    const state = useRepoUIStore.getState()
    expect(state.activeDiffFile).toBeNull()
    expect(state.activePrNumber).toBeNull()
    expect(state.prComposer).toEqual(composer)
  })

  it('opening a PR view or a file diff clears the composer', () => {
    useRepoUIStore.getState().setPrComposer(composer)
    useRepoUIStore.getState().setActivePrNumber(7)
    expect(useRepoUIStore.getState().prComposer).toBeNull()

    useRepoUIStore.getState().setPrComposer(composer)
    useRepoUIStore.getState().setActiveDiffFile({ path: 'a.ts', staged: false })
    expect(useRepoUIStore.getState().prComposer).toBeNull()
  })

  it('is reset by setActiveRepo and setActiveTab', () => {
    useRepoUIStore.getState().setPrComposer(composer)
    useRepoUIStore.getState().setActiveRepo('/repo/a')
    expect(useRepoUIStore.getState().prComposer).toBeNull()

    useRepoUIStore.getState().setPrComposer(composer)
    useRepoUIStore.getState().setActiveTab('pull-requests')
    expect(useRepoUIStore.getState().prComposer).toBeNull()
  })

  it('is cleared when the active repo tab is removed', () => {
    useRepoUIStore.getState().openTab('/repo/a')
    useRepoUIStore.getState().setPrComposer(composer)
    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')
    expect(useRepoUIStore.getState().prComposer).toBeNull()
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
