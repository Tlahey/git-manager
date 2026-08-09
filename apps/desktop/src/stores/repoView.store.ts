import { create } from 'zustand'

/**
 * Which of a repo tab's three views is on screen — the commit graph, the project files, or the
 * Kanban board.
 *
 * **One slot, not one boolean per view.** This used to be `fileExplorer.isOpen` and
 * `boardControls.isOpen`, two independent flags standing for three mutually exclusive views: they
 * could represent "files and board both open", which no layout can draw, so every call site that
 * opened one had to remember to close the other by hand — three of them did, in three different
 * files, and each was one edit away from forgetting. A single value cannot be inconsistent.
 *
 * It also gives the rest of the app the question it actually asks. The toolbar, the left panel and
 * the central area are each scoped to the view now (see `ActionToolbar`, `RepoWorkspace`), so
 * "which view are we on" is read far more often than "is the board open".
 *
 * Not persisted, and not keyed per repository: a tab switch leaves you on the same kind of view,
 * which is the behaviour the two booleans already had.
 */
export type RepoView = 'graph' | 'files' | 'board'

interface RepoViewState {
  view: RepoView
  setView: (view: RepoView) => void
  /**
   * Whether the left panel slot is showing at all — the branch sidebar, the file tree or the board
   * list, whichever the active view puts there.
   *
   * **One flag for the slot, not one per view**, for the same reason `view` is one slot: it is one
   * piece of chrome that three views take turns filling, and ⌘S is one gesture. It lived in
   * `fileExplorer.store` while the files view was the only one that could fold its panel away; that
   * made "hide the panel" mean something different depending on where you stood, and left the other
   * two with no way to reclaim the width at all.
   */
  isPanelOpen: boolean
  togglePanel: () => void
}

export const useRepoViewStore = create<RepoViewState>((set) => ({
  view: 'graph',
  setView: (view) => set({ view }),
  isPanelOpen: true,
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
}))
