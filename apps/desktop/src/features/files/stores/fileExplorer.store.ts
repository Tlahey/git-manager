import { create } from 'zustand'

/**
 * Client-side state of the project files view (the GitHub-style file browser that is one of a repo
 * tab's three views). Nothing here is persisted.
 *
 * **Whether the view is on screen is not here** — that is `repoView.store`'s single `view` slot, for
 * the reason its doc comment gives. What is left is where the user had got to inside the view, and
 * it deliberately survives a switch away and back: the files view is a tab, and a tab that forgets
 * what you were reading the moment you glance at the graph is a tab you stop leaving.
 *
 * **Whether the tree beside it is showing is not here either** — that is `repoView.store`'s
 * `isPanelOpen`, one flag for the panel slot all three views take turns filling, since ⌘S is one
 * gesture wherever you press it.
 *
 * Every field left is scoped to a repository: a path selected in one repo means nothing in the
 * next. `syncRepo` is what enforces that — see its doc comment.
 */
interface FileExplorerState {
  selectedFilePath: string | null
  currentDirPath: string
  treeSearchQuery: string
  /** Repository the browsing state above belongs to, so `syncRepo` can tell a tab switch happened. */
  repoPath: string | null
  actions: {
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
  repoPath: null,
  ...BROWSING_DEFAULTS,
  actions: {
    setSelectedFilePath: (path) => set({ selectedFilePath: path }),
    setCurrentDirPath: (path) => set({ currentDirPath: path, selectedFilePath: null }),
    setTreeSearchQuery: (query) => set({ treeSearchQuery: query }),

    /**
     * Points the explorer at a repository, dropping the previous one's browsing state.
     *
     * Switching repo tab (or entering a worktree) leaves `selectedFilePath` and `currentDirPath`
     * pointing at paths that usually don't exist in the repository now on screen — the explorer
     * would reopen on a file from the previous repo and ask the backend to diff it. Called from
     * `RepoView`, which owns the active repo/worktree path — and it is the *only* thing that drops
     * this state, since switching away to the graph and back is meant to leave it alone.
     */
    syncRepo: (repoPath) =>
      set((state) => (state.repoPath === repoPath ? {} : { repoPath, ...BROWSING_DEFAULTS })),
  },
}))
