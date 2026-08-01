import { create } from 'zustand'

/**
 * Which view a repo tab is showing. `graph` is the historical (and default) content of a repo tab;
 * `terminal` and `settings` relocate features that already existed elsewhere — the integrated
 * terminal dock and the Settings page — into a full-height view of the same tab.
 */
export type RepoViewId = 'graph' | 'terminal' | 'settings'

export const REPO_VIEW_IDS: readonly RepoViewId[] = ['graph', 'terminal', 'settings']

/** The view a tab shows until the user picks another one. */
export const DEFAULT_REPO_VIEW: RepoViewId = 'graph'

interface RepoViewTabsState {
  /**
   * Active view per repo tab path. A path absent from the map is on {@link DEFAULT_REPO_VIEW} —
   * storing only the deviations is what makes "each tab remembers its own view" free: switching
   * repo tabs touches nothing here, so every tab keeps whatever it was last left on.
   */
  byPath: Record<string, RepoViewId>
  setActiveView: (path: string, view: RepoViewId) => void
  /** The active view for `path` (the default when that tab has never switched away from it). */
  activeViewFor: (path: string) => RepoViewId
  /**
   * Forgets a path's view. Called when its tab is closed (or its repo removed) so that reopening it
   * starts on the graph again rather than on a terminal view whose sessions died with the tab.
   */
  clearForPath: (path: string) => void
}

/**
 * The per-repo-tab view selection (graph / terminal / settings).
 *
 * Session-scoped on purpose — not persisted. The terminal view's PTY sessions are owned by the Rust
 * backend and die with the process, so restoring a tab onto an empty terminal after a relaunch would
 * reopen the app on a view that has nothing in it; the graph is the meaningful cold-start view.
 */
export const useRepoViewTabsStore = create<RepoViewTabsState>((set, get) => ({
  byPath: {},

  setActiveView: (path, view) =>
    set((state) => ({ byPath: { ...state.byPath, [path]: view } })),

  activeViewFor: (path) => get().byPath[path] ?? DEFAULT_REPO_VIEW,

  clearForPath: (path) =>
    set((state) => {
      if (!(path in state.byPath)) return state
      const byPath = { ...state.byPath }
      delete byPath[path]
      return { byPath }
    }),
}))
