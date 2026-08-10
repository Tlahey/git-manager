import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createConfigStorage } from '../lib/appConfig/configStorage'
import { appEventBus } from '../lib/appEventBus'
import { closeRepoScopedPanels } from './repoScopedPanels'
import type { RepoUIState } from './repoUI.types'

// Re-exported so every consumer keeps importing the store's vocabulary from the store itself —
// the types moved out of this file, the module they belong to did not.
export type {
  RepoUIState,
  GraphCommitAction,
  TagDialogAction,
  AiPanelTarget,
  CompareRefsTarget,
  PrComposerState,
  ActiveDiffFile,
} from './repoUI.types'

/** Ids of the pinned special tabs (always present, not closeable). */
export const DASHBOARD_TAB = 'dashboard'
export const REWARDS_TAB = 'rewards'
export const PULL_REQUESTS_TAB = 'pull-requests'

/**
 * Every pinned special tab. Callers that need "is this tab backed by a repository?" must ask
 * {@link isSpecialTab} rather than listing the ids themselves: the enumerations scattered across the
 * footer, the shortcuts and the dashboard had drifted apart, so a tab was treated as a repo path by
 * whichever one was missed.
 */
const SPECIAL_TABS: ReadonlySet<string> = new Set([DASHBOARD_TAB, REWARDS_TAB, PULL_REQUESTS_TAB])

/** Whether a tab id is one of the pinned special tabs rather than a repo path or a "New Tab". */
export function isSpecialTab(id: string): boolean {
  return SPECIAL_TABS.has(id)
}

/**
 * Prefix of the ids given to empty "New Tab" placeholders (⌘T / Ctrl+T). They live inside
 * `openTabs` alongside repo paths so they reorder, close and Alt+n-navigate like any other tab —
 * a real filesystem path can never collide with this prefix. Everything reading `openTabs` as a
 * list of repos must filter them out with `isNewTab`, and they're stripped on persist (an empty
 * tab is session-scoped; restoring one on relaunch would be noise).
 */
const NEW_TAB_PREFIX = 'new-tab:'

/** Whether a tab id is an empty "New Tab" placeholder rather than a repo path or a special tab. */
export function isNewTab(id: string): boolean {
  return id.startsWith(NEW_TAB_PREFIX)
}

/** Monotonic counter making each new tab's id unique (never persisted — see `NEW_TAB_PREFIX`). */
let newTabSequence = 0

export const useRepoUIStore = create<RepoUIState>()(
  persist(
    (set, get) => ({
      openTabs: [],
      activeRepo: null,
      activeTab: DASHBOARD_TAB,
      activeWorkspacePath: null,
      activeDiffFile: null,
      activePrNumber: null,
      activeIssue: null,
      activePrFile: null,
      prFilesVisible: true,
      prComposer: null,
      prCreateOpen: false,
      prCreatePrefill: null,
      activeLeftPanel: 'sidebar',
      selectedHistoryOid: null,
      editingOid: null,
      conflictFilePath: null,
      aiPanelTarget: null,
      compareRefsTarget: null,
      pendingGraphSelection: null,
      selectedCommitOid: null,
      selectedCommitOids: [],
      pendingTagDialog: null,
      pendingRemoteBranchDelete: null,
      pendingBranchRename: null,
      selectedStashIndex: null,
      pendingGraphAction: null,
      pendingCommitMenuOid: null,

      setActiveDiffFile: (file) =>
        set((state) => {
          const nextPanel = file ? state.activeLeftPanel : 'sidebar'
          // A new file invalidates any previously pinned historic version, and takes the center
          // panel back from the PR view / composer (they're mutually exclusive there).
          return {
            activeDiffFile: file,
            activeLeftPanel: nextPanel,
            selectedHistoryOid: null,
            activePrNumber: file ? null : state.activePrNumber,
            activeIssue: file ? null : state.activeIssue,
            activePrFile: file ? null : state.activePrFile,
            prComposer: file ? null : state.prComposer,
            prCreateOpen: file ? false : state.prCreateOpen,
          }
        }),

      // Opening a PR view claims the center/right panels; drop any open file diff or PR composer so
      // the center panel-swap sources don't fight (`GitGraph` gives the PR view precedence regardless).
      // Switching or closing a PR always resets the selected PR file (the diff view is per-PR).
      setActivePrNumber: (n) =>
        set((state) => ({
          activePrNumber: n,
          activePrFile: null,
          activeDiffFile: n != null ? null : state.activeDiffFile,
          activeIssue: n != null ? null : state.activeIssue,
          prComposer: n != null ? null : state.prComposer,
          prCreateOpen: n != null ? false : state.prCreateOpen,
        })),

      // Opening an issue claims the center panel, like the PR view it mirrors.
      setActiveIssue: (issue) =>
        set((state) => ({
          activeIssue: issue,
          activeDiffFile: issue ? null : state.activeDiffFile,
          activePrNumber: issue ? null : state.activePrNumber,
          activePrFile: issue ? null : state.activePrFile,
          prComposer: issue ? null : state.prComposer,
          prCreateOpen: issue ? false : state.prCreateOpen,
        })),

      setActivePrFile: (filename) => set({ activePrFile: filename }),

      togglePrFiles: () => set((state) => ({ prFilesVisible: !state.prFilesVisible })),
      setPrFilesVisible: (prFilesVisible) => set({ prFilesVisible }),

      // Opening the composer claims the center panel; drop any open file diff / PR view.
      setPrComposer: (composer) =>
        set((state) => ({
          prComposer: composer,
          activeDiffFile: composer ? null : state.activeDiffFile,
          activePrNumber: composer ? null : state.activePrNumber,
          activeIssue: composer ? null : state.activeIssue,
          activePrFile: composer ? null : state.activePrFile,
          prCreateOpen: composer ? false : state.prCreateOpen,
        })),

      // Opening the create view claims the center panel; drop any open file diff / PR view / composer.
      // The plain "+" entry carries no prefill (falls back to current branch / default base).
      setPrCreateOpen: (open) =>
        set((state) => ({
          prCreateOpen: open,
          prCreatePrefill: null,
          activeDiffFile: open ? null : state.activeDiffFile,
          activePrNumber: open ? null : state.activePrNumber,
          activeIssue: open ? null : state.activeIssue,
          activePrFile: open ? null : state.activePrFile,
          prComposer: open ? null : state.prComposer,
        })),

      openPrCreateWith: (head, base) =>
        set({
          prCreateOpen: true,
          prCreatePrefill: { head, base },
          activeDiffFile: null,
          activePrNumber: null,
          activeIssue: null,
          activePrFile: null,
          prComposer: null,
        }),

      setActiveLeftPanel: (panel) => set({ activeLeftPanel: panel }),

      setSelectedHistoryOid: (oid) => set({ selectedHistoryOid: oid }),

      setEditingOid: (oid) => set({ editingOid: oid }),

      setConflictFilePath: (path) => set({ conflictFilePath: path }),

      setAiPanelTarget: (target) => set({ aiPanelTarget: target }),

      setCompareRefsTarget: (target) => set({ compareRefsTarget: target }),

      setPendingGraphSelection: (oid) => set({ pendingGraphSelection: oid }),

      setSelectedCommitOid: (oid) => set({ selectedCommitOid: oid }),

      // Deduplicated by value, not reference: GitGraph republishes on every graph re-render with a
      // freshly-mapped array, and an unconditional set would notify the store's whole-state
      // subscribers (TabBar & co subscribe without a selector) on every one of those — the exact
      // update-feedback shape that has produced a repo-wide render loop here before.
      setSelectedCommitOids: (oids) => {
        const current = get().selectedCommitOids
        if (current.length === oids.length && current.every((oid, i) => oid === oids[i])) return
        set({ selectedCommitOids: oids })
      },

      setSelectedStashIndex: (index) => set({ selectedStashIndex: index }),

      setPendingGraphAction: (action) => set({ pendingGraphAction: action }),
      setPendingCommitMenuOid: (oid) => set({ pendingCommitMenuOid: oid }),

      setPendingTagDialog: (action) => set({ pendingTagDialog: action }),
      setPendingRemoteBranchDelete: (target) => set({ pendingRemoteBranchDelete: target }),
      setPendingBranchRename: (branch) => set({ pendingBranchRename: branch }),

      setActiveWorkspacePath: (path) => set({ activeWorkspacePath: path }),

      setActiveRepo: (path) => {
        closeRepoScopedPanels()
        set({
          activeRepo: path,
          activeTab: path ?? DASHBOARD_TAB,
          activeWorkspacePath: null,
          activeDiffFile: null,
          activePrNumber: null,
          activeIssue: null,
          activePrFile: null,
          prComposer: null,
          prCreateOpen: false,
          activeLeftPanel: 'sidebar',
          selectedHistoryOid: null,
          conflictFilePath: null,
          aiPanelTarget: null,
          compareRefsTarget: null,
          selectedCommitOid: null,
          selectedCommitOids: [],
          selectedStashIndex: null,
          pendingGraphAction: null,
          pendingCommitMenuOid: null,
          pendingTagDialog: null,
          pendingRemoteBranchDelete: null,
          pendingBranchRename: null,
        })
      },

      setActiveTab: (id) => {
        closeRepoScopedPanels()
        // Raised here rather than from `PullRequestsPage`'s mount, which also happens on relaunch
        // when the Launchpad was the tab left open — and a reward has to answer for something the
        // user did (see `lib/appEventBus.ts`). Every way in goes through this one setter: the tab
        // strip, the command palette, the ⌘-shortcut and a clicked notification.
        if (id === PULL_REQUESTS_TAB) appEventBus.notify('open_launchpad')
        set((state) => ({
          activeTab: id,
          // An empty "New Tab" is in `openTabs` but is not a repo — it must not become `activeRepo`.
          activeRepo: state.openTabs.includes(id) && !isNewTab(id) ? id : null,
          activeWorkspacePath: null,
          activeDiffFile: null,
          activePrNumber: null,
          activeIssue: null,
          activePrFile: null,
          prComposer: null,
          prCreateOpen: false,
          activeLeftPanel: 'sidebar',
          selectedHistoryOid: null,
          conflictFilePath: null,
          aiPanelTarget: null,
          compareRefsTarget: null,
          selectedCommitOid: null,
          selectedCommitOids: [],
          selectedStashIndex: null,
          pendingGraphAction: null,
          pendingCommitMenuOid: null,
          pendingTagDialog: null,
          pendingRemoteBranchDelete: null,
          pendingBranchRename: null,
        }))
      },

      openTab: (path) => {
        closeRepoScopedPanels()
        set((state) => {
          // Opening a repo while an empty "New Tab" is focused consumes that placeholder: it takes
          // the repo's place in the strip, or simply closes if the repo already has a tab (we just
          // switch to it). Same intent either way — the empty tab never lingers next to the repo it
          // was used to open.
          const consumesNewTab = isNewTab(state.activeTab)
          let openTabs: string[]
          if (state.openTabs.includes(path)) {
            openTabs = consumesNewTab
              ? state.openTabs.filter((p) => p !== state.activeTab)
              : state.openTabs
          } else if (consumesNewTab) {
            openTabs = state.openTabs.map((p) => (p === state.activeTab ? path : p))
          } else {
            openTabs = [...state.openTabs, path]
          }
          return {
            openTabs,
            activeRepo: path,
            activeTab: path,
            activeWorkspacePath: null,
          }
        })
      },

      openNewTab: () => {
        closeRepoScopedPanels()
        set((state) => {
          const id = `${NEW_TAB_PREFIX}${++newTabSequence}`
          return {
            openTabs: [...state.openTabs, id],
            activeTab: id,
            activeRepo: null,
            activeWorkspacePath: null,
            activeDiffFile: null,
            activePrNumber: null,
            activeIssue: null,
            activePrFile: null,
            prComposer: null,
            prCreateOpen: false,
            conflictFilePath: null,
            selectedCommitOid: null,
            selectedCommitOids: [],
            selectedStashIndex: null,
            pendingGraphAction: null,
            pendingCommitMenuOid: null,
          }
        })
      },

      closeTab: (path) => {
        // Only a close that moves the user elsewhere is a tab change; closing a
        // background tab must leave the panels of the one they are looking at alone.
        if (get().activeTab === path) closeRepoScopedPanels()
        set((state) => {
          const newTabs = state.openTabs.filter((p) => p !== path)
          const wasActive = state.activeTab === path
          const fallback = newTabs[newTabs.length - 1] ?? DASHBOARD_TAB
          return {
            openTabs: newTabs,
            activeRepo: wasActive
              ? newTabs.includes(fallback) && !isNewTab(fallback)
                ? fallback
                : null
              : state.activeRepo,
            activeTab: wasActive ? fallback : state.activeTab,
            activeWorkspacePath: wasActive ? null : state.activeWorkspacePath,
          }
        })
      },

      reorderTabs: (from, to) =>
        set((state) => {
          if (from === to || from < 0 || to < 0) return state
          const tabs = [...state.openTabs]
          if (from >= tabs.length || to >= tabs.length) return state
          const [moved] = tabs.splice(from, 1)
          tabs.splice(to, 0, moved)
          return { openTabs: tabs }
        }),

      clearTabStateForRemovedRepo: (path) => {
        if (get().activeTab === path) closeRepoScopedPanels()
        set((state) => {
          const wasActive = state.activeTab === path
          return {
            openTabs: state.openTabs.filter((p) => p !== path),
            activeRepo: state.activeRepo === path ? null : state.activeRepo,
            activeTab: wasActive ? DASHBOARD_TAB : state.activeTab,
            activeWorkspacePath: wasActive ? null : state.activeWorkspacePath,
            activePrNumber: wasActive ? null : state.activePrNumber,
            activeIssue: wasActive ? null : state.activeIssue,
            activePrFile: wasActive ? null : state.activePrFile,
            prComposer: wasActive ? null : state.prComposer,
            prCreateOpen: wasActive ? false : state.prCreateOpen,
          }
        })
      },
    }),
    {
      name: 'git-manager-repos-ui',
      // The `workspace` section of ~/.git-manager/settings.json — see lib/appConfig/.
      storage: createConfigStorage('workspace'),
      skipHydration: true,
      // Empty "New Tab" placeholders are session-scoped: restoring one on relaunch would just be
      // noise, so they're stripped here (and the active tab falls back to the dashboard if it was one).
      partialize: (state) => ({
        openTabs: state.openTabs.filter((path) => !isNewTab(path)),
        activeRepo: state.activeRepo,
        activeTab: isNewTab(state.activeTab) ? DASHBOARD_TAB : state.activeTab,
      }),
    }
  )
)
