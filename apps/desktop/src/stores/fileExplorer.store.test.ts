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
  it('clears the selected file when opening the explorer', () => {
    actions().setSelectedFilePath('src/a.ts')
    actions().toggleOpen()

    expect(useFileExplorerStore.getState().isOpen).toBe(true)
    expect(useFileExplorerStore.getState().selectedFilePath).toBeNull()
  })

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

  it('keeps the panel toggles across a repository switch', () => {
    actions().syncRepo('/repo-a')
    actions().toggleOpen()
    actions().toggleSidebar()
    const { isOpen, isSidebarOpen } = useFileExplorerStore.getState()

    actions().syncRepo('/repo-b')

    expect(useFileExplorerStore.getState().isOpen).toBe(isOpen)
    expect(useFileExplorerStore.getState().isSidebarOpen).toBe(isSidebarOpen)
  })

  it('resets when the repository goes away entirely', () => {
    actions().syncRepo('/repo-a')
    actions().setSelectedFilePath('src/a.ts')

    actions().syncRepo(null)

    expect(useFileExplorerStore.getState().repoPath).toBeNull()
    expect(useFileExplorerStore.getState().selectedFilePath).toBeNull()
  })
})
