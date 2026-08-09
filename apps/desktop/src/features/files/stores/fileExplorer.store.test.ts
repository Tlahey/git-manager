import { describe, it, expect, beforeEach } from 'vitest'
import { useFileExplorerStore } from './fileExplorer.store'

const initial = useFileExplorerStore.getState()

function actions() {
  return useFileExplorerStore.getState().actions
}

beforeEach(() => {
  useFileExplorerStore.setState(initial, true)
})

describe('fileExplorer.store — browsing', () => {
  it('drops the selected file when navigating into a directory', () => {
    actions().setSelectedFilePath('src/a.ts')
    actions().setCurrentDirPath('docs')

    expect(useFileExplorerStore.getState().currentDirPath).toBe('docs')
    expect(useFileExplorerStore.getState().selectedFilePath).toBeNull()
  })
})

describe('fileExplorer.store — syncRepo', () => {
  it('drops browsing state that belonged to the previous repository', () => {
    actions().syncRepo('/repo-a')
    actions().setCurrentDirPath('src')
    actions().setSelectedFilePath('src/a.ts')
    actions().setTreeSearchQuery('button')

    actions().syncRepo('/repo-b')

    const state = useFileExplorerStore.getState()
    expect(state.repoPath).toBe('/repo-b')
    expect(state.selectedFilePath).toBeNull()
    expect(state.currentDirPath).toBe('')
    expect(state.treeSearchQuery).toBe('')
  })

  it('leaves everything alone when the repository has not changed', () => {
    actions().syncRepo('/repo-a')
    // Order matters: navigating into a directory closes the open file (see `setCurrentDirPath`).
    actions().setCurrentDirPath('src')
    actions().setSelectedFilePath('src/a.ts')

    actions().syncRepo('/repo-a')

    expect(useFileExplorerStore.getState().selectedFilePath).toBe('src/a.ts')
    expect(useFileExplorerStore.getState().currentDirPath).toBe('src')
  })

  /**
   * The tree-panel toggle is deliberately *not* here any more — it is `repoView.store`'s
   * `isPanelOpen`, one flag for the slot all three views take turns filling. What is left in this
   * store is per-repository, which is exactly what `syncRepo` drops.
   */
  it('drops the open search along with the rest of the browsing state', () => {
    actions().syncRepo('/repo-a')
    actions().toggleSearch()
    actions().setTreeSearchQuery('Button')

    actions().syncRepo('/repo-b')

    expect(useFileExplorerStore.getState().isSearchOpen).toBe(false)
    expect(useFileExplorerStore.getState().treeSearchQuery).toBe('')
  })

  it('resets when the repository goes away entirely', () => {
    actions().syncRepo('/repo-a')
    actions().setSelectedFilePath('src/a.ts')

    actions().syncRepo(null)

    expect(useFileExplorerStore.getState().repoPath).toBeNull()
    expect(useFileExplorerStore.getState().selectedFilePath).toBeNull()
  })
})
