import { create } from 'zustand'

/**
 * Client-side state of the project files view (the GitHub-style file browser that replaces the
 * graph in the center panel). Nothing here is persisted.
 *
 * Every field but the two toggles is scoped to a repository: a path selected in one repo means
 * nothing in the next. `syncRepo` is what enforces that — see its doc comment.
 */
interface FileExplorerState {
  isOpen: boolean
  isSidebarOpen: boolean
  selectedFilePath: string | null
  currentDirPath: string
  treeSearchQuery: string
  /** Repository the browsing state above belongs to, so `syncRepo` can tell a tab switch happened. */
  repoPath: string | null
  actions: {
    toggleOpen: () => void
    toggleSidebar: () => void
    setIsOpen: (isOpen: boolean) => void
    setSelectedFilePath: (path: string | null) => void
    setCurrentDirPath: (path: string) => void
    setTreeSearchQuery: (query: string) => void
    syncRepo: (repoPath: string | null) => void
  }
}

/** Browsing state that only makes sense within one repository. */
const BROWSING_DEFAULTS = {
  selectedFilePath: null,
  currentDirPath: '',
  treeSearchQuery: '',
} as const

export const useFileExplorerStore = create<FileExplorerState>((set) => ({
  isOpen: false,
  isSidebarOpen: true,
  repoPath: null,
  ...BROWSING_DEFAULTS,
  actions: {
    toggleOpen: () =>
      set((state) => ({
        isOpen: !state.isOpen,
        selectedFilePath: !state.isOpen ? null : state.selectedFilePath,
      })),
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setIsOpen: (isOpen) =>
      set((state) => ({
        isOpen,
        selectedFilePath: isOpen ? null : state.selectedFilePath,
        currentDirPath: isOpen ? '' : state.currentDirPath,
      })),
    setSelectedFilePath: (path) => set({ selectedFilePath: path }),
    setCurrentDirPath: (path) => set({ currentDirPath: path, selectedFilePath: null }),
    setTreeSearchQuery: (query) => set({ treeSearchQuery: query }),

    /**
     * Points the explorer at a repository, dropping the previous one's browsing state.
     *
     * Switching repo tab (or entering a worktree) leaves `selectedFilePath` and `currentDirPath`
     * pointing at paths that usually don't exist in the repository now on screen — the explorer
     * would reopen on a file from the previous repo and ask the backend to diff it. Called from
     * `RepoView`, which owns the active repo/worktree path.
     */
    syncRepo: (repoPath) =>
      set((state) => (state.repoPath === repoPath ? {} : { repoPath, ...BROWSING_DEFAULTS })),
  },
}))
