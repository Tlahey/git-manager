import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Identifiants des onglets spéciaux (toujours présents, non fermables). */
export const DASHBOARD_TAB = 'dashboard'
export const REWARDS_TAB = 'rewards'
export const PULL_REQUESTS_TAB = 'pull-requests'

interface RepoUIState {
  openTabs: string[] // paths des repos ouverts en onglet
  activeRepo: string | null
  activeTab: string // 'dashboard' | 'pull-requests' | <repoPath>
  activeDiffFile: { path: string; staged: boolean; oid?: string } | null
  setActiveDiffFile: (file: { path: string; staged: boolean; oid?: string } | null) => void
  activeLeftPanel: 'sidebar' | 'blame' | 'history'
  setActiveLeftPanel: (panel: 'sidebar' | 'blame' | 'history') => void
  editingOid: string | null
  setEditingOid: (oid: string | null) => void
  /** Main content area shows `ConflictDiffView` for this file instead of the graph/`DiffViewCenter`. */
  conflictFilePath: string | null
  setConflictFilePath: (path: string | null) => void
  /**
   * Bridge for triggering graph-row selection (e.g. the synthetic "CONFLICT" row) from outside
   * `GitGraph.tsx` — the toolbar lives in a separate branch of the component tree and has no
   * direct access to `useCommitSelection`'s local `selectSingle`. `GitGraph.tsx` watches this
   * and calls `selectSingle` on change, then clears it.
   */
  pendingGraphSelection: string | null
  setPendingGraphSelection: (oid: string | null) => void

  setActiveRepo: (path: string | null) => void
  setActiveTab: (id: string) => void
  openTab: (path: string) => void
  closeTab: (path: string) => void
  reorderTabs: (from: number, to: number) => void
  /** Clears tab/selection state referencing a repo that's being fully removed. Called from
   * repoData.store's `removeRepo` (cross-store side effect) rather than duplicated there. */
  clearTabStateForRemovedRepo: (path: string) => void
}

export const useRepoUIStore = create<RepoUIState>()(
  persist(
    (set) => ({
      openTabs: [],
      activeRepo: null,
      activeTab: DASHBOARD_TAB,
      activeDiffFile: null,
      activeLeftPanel: 'sidebar',
      editingOid: null,
      conflictFilePath: null,
      pendingGraphSelection: null,

      setActiveDiffFile: (file) =>
        set((state) => {
          const nextPanel = file ? state.activeLeftPanel : 'sidebar'
          return { activeDiffFile: file, activeLeftPanel: nextPanel }
        }),

      setActiveLeftPanel: (panel) => set({ activeLeftPanel: panel }),

      setEditingOid: (oid) => set({ editingOid: oid }),

      setConflictFilePath: (path) => set({ conflictFilePath: path }),

      setPendingGraphSelection: (oid) => set({ pendingGraphSelection: oid }),

      setActiveRepo: (path) =>
        set({
          activeRepo: path,
          activeTab: path ?? DASHBOARD_TAB,
          activeDiffFile: null,
          activeLeftPanel: 'sidebar',
          conflictFilePath: null,
        }),

      setActiveTab: (id) =>
        set((state) => ({
          activeTab: id,
          activeRepo: state.openTabs.includes(id) ? id : null,
          activeDiffFile: null,
          activeLeftPanel: 'sidebar',
          conflictFilePath: null,
        })),

      openTab: (path) =>
        set((state) => ({
          openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path],
          activeRepo: path,
          activeTab: path,
        })),

      closeTab: (path) =>
        set((state) => {
          const newTabs = state.openTabs.filter((p) => p !== path)
          const wasActive = state.activeTab === path
          const fallback = newTabs[newTabs.length - 1] ?? DASHBOARD_TAB
          return {
            openTabs: newTabs,
            activeRepo: wasActive
              ? newTabs.includes(fallback)
                ? fallback
                : null
              : state.activeRepo,
            activeTab: wasActive ? fallback : state.activeTab,
          }
        }),

      reorderTabs: (from, to) =>
        set((state) => {
          if (from === to || from < 0 || to < 0) return state
          const tabs = [...state.openTabs]
          if (from >= tabs.length || to >= tabs.length) return state
          const [moved] = tabs.splice(from, 1)
          tabs.splice(to, 0, moved)
          return { openTabs: tabs }
        }),

      clearTabStateForRemovedRepo: (path) =>
        set((state) => {
          const wasActive = state.activeTab === path
          return {
            openTabs: state.openTabs.filter((p) => p !== path),
            activeRepo: state.activeRepo === path ? null : state.activeRepo,
            activeTab: wasActive ? DASHBOARD_TAB : state.activeTab,
          }
        }),
    }),
    {
      name: 'git-manager-repos-ui',
      partialize: (state) => ({
        openTabs: state.openTabs,
        activeRepo: state.activeRepo,
        activeTab: state.activeTab,
      }),
    }
  )
)
