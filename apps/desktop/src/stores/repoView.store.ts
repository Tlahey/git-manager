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
   * Whether the left panel slot is at full width — the branch sidebar, the file tree or the board
   * list, whichever the active view puts there.
   *
   * **One flag for the slot, not one per view**, for the same reason `view` is one slot: it is one
   * piece of chrome that three views take turns filling, and ⌘S is one gesture. It lived in
   * `fileExplorer.store` while the files view was the only one that could fold its panel away; that
   * made "hide the panel" mean something different depending on where you stood, and left the other
   * two with no way to reclaim the width at all.
   *
   * **What "off" looks like is the panel's own answer, not this store's.** The graph's sidebar
   * reduces to a column of section icons carrying their counts (`SidebarRail`), because it has a
   * useful compact form; the file tree and the board list have nothing equivalent, so they leave
   * the slot. One flag, one gesture, and each panel gives back as much width as it can afford.
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

/**
 * Puts the commit graph back on screen — the view that owns the central area, and the only one that
 * draws what the rest of the app navigates *to*.
 *
 * **Why this is a named function and not a bare `setView('graph')` at each call site.** A pull
 * request, the PR composer and every AI panel are rendered by `GitGraph` alone (see `RepoWorkspace`:
 * the centre slot holds `BoardPage`, `FilesPage` or `GitGraph`, and neither of the first two reads
 * `activePrNumber`, `prCreateOpen` or `aiPanelTarget` — the files view draws its own diffs and
 * nothing else). So anything that sets one of those from *outside* the graph — a clicked
 * notification, the footer's AI pill, a command palette entry — navigates the user to a destination
 * the screen does not contain: the state changes, nothing moves, and the click reads as broken. The
 * same holds for an action that only moves the repository: fetching from the board updated the graph
 * behind a Kanban.
 *
 * Imperative rather than a hook because every caller is one — a Tauri event listener, a palette
 * `run`, a keydown handler — none of which has a component in scope.
 *
 * It deliberately does **not** touch `isPanelOpen`: which panel is folded away is the user's
 * standing choice about width, not part of where they are being taken.
 */
export function goToRepoContent(): void {
  useRepoViewStore.getState().setView('graph')
}

/**
 * Makes room for a *file diff*, which is the one destination two views can draw: the graph opens it
 * in its centre slot, and the files view is built around it. Only the board has nowhere to put one.
 *
 * Separate from {@link goToRepoContent} precisely so it can stay put on those two. Opening a file
 * from ⌘P while reading the files view must not throw the user onto the graph — the diff was already
 * going to appear exactly where they were looking.
 */
export function goToRepoDiff(): void {
  if (useRepoViewStore.getState().view === 'board') goToRepoContent()
}
