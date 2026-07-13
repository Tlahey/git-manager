import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Identifiants des onglets spéciaux (toujours présents, non fermables). */
export const DASHBOARD_TAB = 'dashboard'
export const REWARDS_TAB = 'rewards'
export const PULL_REQUESTS_TAB = 'pull-requests'

/**
 * Commit-scoped action the graph can perform on the currently selected commit, dispatched from
 * outside `GitGraph.tsx` (e.g. the command palette) via `pendingGraphAction`. Structurally this is
 * the same payload the native context menu produces — `useGitGraphActions` re-exports it as
 * `PendingAction` (this union `| null`).
 */
export type GraphCommitAction =
  | { kind: 'reset'; mode: 'soft' | 'mixed' | 'hard'; targetOid?: string; targetSubject?: string }
  | { kind: 'revert' }
  | { kind: 'branch' }
  | { kind: 'tag'; annotated: boolean }
  | { kind: 'compare' }
  | { kind: 'fixup' }

interface RepoUIState {
  openTabs: string[] // paths des repos ouverts en onglet
  activeRepo: string | null
  activeTab: string // 'dashboard' | 'pull-requests' | <repoPath>
  activeDiffFile: { path: string; staged: boolean; oid?: string } | null
  setActiveDiffFile: (file: { path: string; staged: boolean; oid?: string } | null) => void
  activeLeftPanel: 'sidebar' | 'blame' | 'history'
  setActiveLeftPanel: (panel: 'sidebar' | 'blame' | 'history') => void
  /**
   * OID of the file version selected in the Blame/History panel. When set, `DiffViewCenter` shows
   * that historic version of the file (and it's the highlighted row in the panel). `null` = current
   * working/committed contents. Reset whenever the active diff file changes.
   */
  selectedHistoryOid: string | null
  setSelectedHistoryOid: (oid: string | null) => void
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
  /**
   * OID of the commit currently selected in the graph — a mirror of `useCommitSelection`'s local
   * `primaryOid`, published so out-of-tree UI (the command palette) can tell whether a commit is
   * selected and act on it. `null` for no selection or the synthetic WIP/CONFLICT rows.
   */
  selectedCommitOid: string | null
  setSelectedCommitOid: (oid: string | null) => void
  /**
   * Stash index (parsed from `stash@{N}`) when the selected row is a stash entry, `null` otherwise —
   * published alongside `selectedCommitOid` so out-of-tree UI can offer stash-scoped actions
   * (apply/pop/drop) without duplicating the stash-detection logic already in
   * `useGitGraphActions.ts`'s native-menu path.
   */
  selectedStashIndex: number | null
  setSelectedStashIndex: (index: number | null) => void
  /**
   * Bridge for triggering a commit-scoped action (reset/revert/tag/…) on the selected commit from
   * outside `GitGraph.tsx`, mirroring `pendingGraphSelection` above. `GitGraph.tsx` watches this,
   * forwards it to the graph's own `setPendingAction` (which opens the matching dialog against
   * `primaryOid`), then clears it.
   */
  pendingGraphAction: GraphCommitAction | null
  setPendingGraphAction: (action: GraphCommitAction | null) => void

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
      selectedHistoryOid: null,
      editingOid: null,
      conflictFilePath: null,
      pendingGraphSelection: null,
      selectedCommitOid: null,
      selectedStashIndex: null,
      pendingGraphAction: null,

      setActiveDiffFile: (file) =>
        set((state) => {
          const nextPanel = file ? state.activeLeftPanel : 'sidebar'
          // A new file invalidates any previously pinned historic version.
          return { activeDiffFile: file, activeLeftPanel: nextPanel, selectedHistoryOid: null }
        }),

      setActiveLeftPanel: (panel) => set({ activeLeftPanel: panel }),

      setSelectedHistoryOid: (oid) => set({ selectedHistoryOid: oid }),

      setEditingOid: (oid) => set({ editingOid: oid }),

      setConflictFilePath: (path) => set({ conflictFilePath: path }),

      setPendingGraphSelection: (oid) => set({ pendingGraphSelection: oid }),

      setSelectedCommitOid: (oid) => set({ selectedCommitOid: oid }),

      setSelectedStashIndex: (index) => set({ selectedStashIndex: index }),

      setPendingGraphAction: (action) => set({ pendingGraphAction: action }),

      setActiveRepo: (path) =>
        set({
          activeRepo: path,
          activeTab: path ?? DASHBOARD_TAB,
          activeDiffFile: null,
          activeLeftPanel: 'sidebar',
          selectedHistoryOid: null,
          conflictFilePath: null,
          selectedCommitOid: null,
          selectedStashIndex: null,
          pendingGraphAction: null,
        }),

      setActiveTab: (id) =>
        set((state) => ({
          activeTab: id,
          activeRepo: state.openTabs.includes(id) ? id : null,
          activeDiffFile: null,
          activeLeftPanel: 'sidebar',
          selectedHistoryOid: null,
          conflictFilePath: null,
          selectedCommitOid: null,
          selectedStashIndex: null,
          pendingGraphAction: null,
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
