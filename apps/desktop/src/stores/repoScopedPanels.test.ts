import { describe, it, expect, beforeEach } from 'vitest'
import { closeRepoScopedPanels } from './repoScopedPanels'
import { useBisectUIStore } from './bisectUI.store'
import { usePackageHealthStore } from './packageHealth.store'
import { usePatchWorkspaceStore } from './patchWorkspace.store'
import { useStashDialogStore } from './stashDialog.store'
import { useRepoUIStore, DASHBOARD_TAB } from './repoUI.store'

/** Every repo-scoped panel open at once, as if the user had been working in a tab. */
function openEverything() {
  usePatchWorkspaceStore.getState().open('create')
  usePackageHealthStore.getState().openTool()
  useStashDialogStore.getState().openBisectDialog('/repo/a')
  useBisectUIStore.getState().beginSetup()
}

function allClosed() {
  return {
    patch: usePatchWorkspaceStore.getState().mode,
    health: usePackageHealthStore.getState().open,
    stash: useStashDialogStore.getState().isOpen,
    bisect: useBisectUIStore.getState().setupActive,
  }
}

const CLOSED = { patch: null, health: false, stash: false, bisect: false }

beforeEach(() => {
  useRepoUIStore.setState({
    openTabs: ['/repo/a', '/repo/b'],
    activeTab: '/repo/a',
    activeRepo: '/repo/a',
  })
  closeRepoScopedPanels()
})

describe('closeRepoScopedPanels', () => {
  it('closes every panel and dialog that belongs to one repo view', () => {
    openEverything()
    expect(allClosed()).not.toEqual(CLOSED)

    closeRepoScopedPanels()

    expect(allClosed()).toEqual(CLOSED)
  })

  it('is safe to call when nothing is open', () => {
    expect(() => closeRepoScopedPanels()).not.toThrow()
    expect(allClosed()).toEqual(CLOSED)
  })
})

/**
 * The bug this exists for: these stores are global, not per-repo, so without the
 * reset a new tab opened showing the previous repo's tool.
 */
describe('repoUI tab changes close the repo-scoped panels', () => {
  it('closes them when switching to another tab', () => {
    openEverything()

    useRepoUIStore.getState().setActiveTab('/repo/b')

    expect(allClosed()).toEqual(CLOSED)
  })

  it('closes them when switching repo directly', () => {
    openEverything()

    useRepoUIStore.getState().setActiveRepo('/repo/b')

    expect(allClosed()).toEqual(CLOSED)
  })

  it('closes them when opening a repo tab', () => {
    openEverything()

    useRepoUIStore.getState().openTab('/repo/c')

    expect(allClosed()).toEqual(CLOSED)
  })

  it('closes them when opening an empty new tab', () => {
    openEverything()

    useRepoUIStore.getState().openNewTab()

    expect(allClosed()).toEqual(CLOSED)
  })

  it('closes them when the tab being looked at is closed', () => {
    openEverything()

    useRepoUIStore.getState().closeTab('/repo/a')

    expect(allClosed()).toEqual(CLOSED)
  })

  it('closes them when the active repo is removed', () => {
    openEverything()

    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/a')

    expect(useRepoUIStore.getState().activeTab).toBe(DASHBOARD_TAB)
    expect(allClosed()).toEqual(CLOSED)
  })

  /** Closing a background tab is not a tab change — the current view must survive it. */
  it('leaves the panels alone when a background tab is closed', () => {
    openEverything()

    useRepoUIStore.getState().closeTab('/repo/b')

    expect(useRepoUIStore.getState().activeTab).toBe('/repo/a')
    expect(allClosed()).not.toEqual(CLOSED)
  })

  it('leaves the panels alone when a background repo is removed', () => {
    openEverything()

    useRepoUIStore.getState().clearTabStateForRemovedRepo('/repo/b')

    expect(useRepoUIStore.getState().activeTab).toBe('/repo/a')
    expect(allClosed()).not.toEqual(CLOSED)
  })
})
