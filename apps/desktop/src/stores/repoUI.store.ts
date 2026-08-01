import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MockIssue } from '../app/pull-requests/types'
import { closeRepoScopedPanels } from './repoScopedPanels'
import { useRepoViewTabsStore } from './repoViewTabs.store'

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
  | { kind: 'renameBranch'; branch: string }
  /** Opens the upstream picker for `branch` — reached only when no default is unambiguous (see
   *  `resolveDefaultUpstream`); an unambiguous default is applied straight away, no dialog. */
  | { kind: 'setUpstream'; branch: string }
  | { kind: 'tag'; annotated: boolean }
  | { kind: 'compare' }
  /**
   * Diff a MERGE commit against one specific parent (`parentNumber` is 1-based, as in `git revert
   * -m`). Its own kind rather than a flag on `compare`, because the two answer different questions:
   * `compare` reads a commit against the working directory, this one against one side of a merge —
   * the reading the details panel cannot show, since it always takes the first parent.
   */
  | { kind: 'compareParent'; parentNumber: number }
  | { kind: 'fixup' }
  /**
   * Rewrite commit messages with the model, reviewed before anything is applied.
   *
   * `includeChildren` is the difference between the two menu entries: `false` rewords the clicked
   * commit alone, `true` also rewords every commit that descends from it on the current branch. It
   * is part of the action rather than a dialog toggle because the two are separate menu entries with
   * separate counts, and a user who picked one should not have to re-pick it inside the dialog.
   */
  | { kind: 'recompose'; includeChildren: boolean }

/**
 * What the right panel's AI output is about. A branch carries the base it is compared against; a
 * commit carries the metadata the panel shows in its header (the diff itself is fetched by the
 * hook). Distinct shapes rather than one loose record, so a branch target can never be rendered as a
 * commit one.
 *
 * The `review*` kinds are the AI code review, which asks the opposite question of the explanations
 * ("is this alright?" rather than "what is this?"). They live in the same union because they render
 * into the same single right-panel slot: making them one state is what guarantees a review and an
 * explanation can never both claim it.
 */
export type AiPanelTarget =
  | { kind: 'branch'; branch: string; baseRef: string }
  | { kind: 'working' }
  | {
      kind: 'commit'
      oid: string
      shortOid: string
      subject: string
      body: string
      author: string
      parentCount: number
    }
  | { kind: 'reviewWorking' }
  | { kind: 'reviewBranch'; branch: string; baseRef: string }
  // The archived daily briefings for *this* repository. Not an explanation of a diff like its
  // siblings, but it asks for the same thing from the layout — the right-hand slot, exclusively —
  // and putting it in the same union is what stops it and an explanation both claiming it.
  | { kind: 'summaries' }
  /**
   * The AI commit search. Like `summaries`, it names no subject — the subject is the question the
   * user is about to type, and the panel owns it, which is also why nothing here needs keying.
   */
  | { kind: 'search' }

/**
 * The two sides of the branch comparison dialog: the diff shown is `git diff <baseRef> <headRef>`,
 * so `baseRef` is the "from" state and `headRef` the "to" one — swapping them is a different diff,
 * not a cosmetic change. Both are ref *names* (`main`, `origin/main`, a tag), never OIDs: the dialog
 * lets the user re-pick either side from the branch list, which is named the same way.
 */
export interface CompareRefsTarget {
  baseRef: string
  headRef: string
}

/**
 * Handoff for the PR-creation composer, set once "ship from here" has made the local commit (and, on
 * a protected branch, the new branch). Held here — not in the WIP staging column that triggered it —
 * because that commit clears the working tree, which unmounts the WIP panel; the composer instead
 * renders as a center-panel takeover (like `activePrNumber`) driven by this state, so it survives.
 */
export interface PrComposerState {
  /** Branch to push + open the PR from (the current branch, or the freshly created one). */
  head: string
  /** Default base branch to pre-fill (the user can still override in the composer). */
  baseRef: string
  /** Default PR title (the commit message that was just used). */
  title: string
}

/**
 * A file whose diff takes over the center panel. `oid` is the commit whose version is shown (unset
 * for a working-tree file). `baseOid` is only set for a merged multi-commit selection: it names the
 * oldest selected commit, so the diff spans `baseOid^..oid` (the same range as the summary panel)
 * instead of `oid` vs its own first parent.
 */
export interface ActiveDiffFile {
  path: string
  staged: boolean
  oid?: string
  baseOid?: string
  /**
   * Which tab `DiffViewCenter` should open on. Defaults to `'diff'`; the command-palette file lookup
   * sets `'file'` so the file's contents are shown straight away (there's no meaningful diff when
   * just browsing a file).
   */
  initialTab?: 'diff' | 'file' | 'preview'
  unmodified?: boolean
}

interface RepoUIState {
  /** Repo paths open as tabs, plus any empty "New Tab" placeholders (see `isNewTab`). */
  openTabs: string[]
  activeRepo: string | null
  activeTab: string // 'dashboard' | 'pull-requests' | 'new-tab:<n>' | <repoPath>
  /**
   * Path of the linked worktree currently being viewed "in place" of the active repo tab — the
   * graph/sidebar/status all switch to this path's data while it's set (see `RepoView.tsx`'s
   * `effectiveRepoPath`), but the tab bar/`activeRepo` never change: entering a workspace is a view
   * switch, not a new tab. `null` = viewing the repo tab's own branch normally. Not persisted
   * (session-scoped, like `activeDiffFile`) — reset wherever the active repo/tab itself changes,
   * since a workspace only makes sense relative to the tab it was entered from.
   */
  activeWorkspacePath: string | null
  setActiveWorkspacePath: (path: string | null) => void
  activeDiffFile: ActiveDiffFile | null
  setActiveDiffFile: (file: ActiveDiffFile | null) => void
  /**
   * When set, the repo view swaps its center panel for the in-app PR view (description, CI status,
   * comment/review, merge) and its right panel for the PR's changed-files list — mirroring how
   * `activeDiffFile`/`conflictFilePath` each independently drive a panel swap. `null` = normal graph
   * view. Not persisted (session-scoped, like `activeDiffFile`).
   */
  activePrNumber: number | null
  setActivePrNumber: (n: number | null) => void
  /**
   * When set, the repo view swaps its center panel for the in-app issue view — the sidebar's Issues
   * section opening one, the issue-side twin of `activePrNumber`. The whole issue is held, not just
   * its number: `IssueDetailCenter` needs the list item itself (for the local-branch section), and
   * the center panel has no issue list of its own to look one up in. Mutually exclusive with the
   * other center-panel claimants. Not persisted (session-scoped).
   */
  activeIssue: MockIssue | null
  setActiveIssue: (issue: MockIssue | null) => void
  /**
   * Filename of the PR file whose diff is shown in the center panel (only meaningful while
   * `activePrNumber` is set). `null` = show the PR detail view. Reset whenever the active PR changes
   * or closes. Session-scoped, not persisted.
   */
  activePrFile: string | null
  setActivePrFile: (filename: string | null) => void
  /** Whether the always-on-right PR files panel is shown (toggled from the PR header). Default on. */
  prFilesVisible: boolean
  togglePrFiles: () => void
  setPrFilesVisible: (visible: boolean) => void
  /**
   * When set, the repo view swaps its center panel for the PR-creation composer (title, base branch,
   * template/AI description). Set by `usePrPublishFlow.commitAndPrepare` after the commit exists,
   * cleared on create/cancel. Mutually exclusive with `activePrNumber`/`activeDiffFile` (all three
   * claim the center panel). Not persisted (session-scoped, like `activePrNumber`).
   */
  prComposer: PrComposerState | null
  setPrComposer: (composer: PrComposerState | null) => void
  /**
   * When true, the repo view swaps its center panel for the standalone PR-creation view (pick
   * head/base branch, title, template/AI description, draft). Opened from the sidebar "Pull
   * Requests" section "+" button — unlike `prComposer`, no prior commit is required. Mutually
   * exclusive with `activePrNumber`/`activeDiffFile`/`prComposer` (all claim the center panel).
   * Not persisted (session-scoped).
   */
  prCreateOpen: boolean
  setPrCreateOpen: (open: boolean) => void
  /**
   * Head/base branch pre-selection for the PR-create view when opened from the ref drag-and-drop
   * menu ("Start a pull request … from … to …"). `null` for the plain sidebar "+" entry, which
   * falls back to the current branch / GitHub default base. Consumed by `PrCreateCenter`.
   */
  prCreatePrefill: { head: string; base: string } | null
  /** Opens the PR-create view with head/base pre-selected (ref drag-and-drop "Start a PR"). */
  openPrCreateWith: (head: string, base: string) => void
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
   * What the right panel's AI explanation or review is showing, or `null`. Lives here rather than in
   * `GitGraph` because the graph's commit menu and the sidebar's branch menu both open it, and they
   * sit in different branches of the tree. Session-scoped, not persisted — unlike the generated
   * *text*, which `aiExplanation.store` keeps across restarts.
   */
  aiPanelTarget: AiPanelTarget | null
  setAiPanelTarget: (target: AiPanelTarget | null) => void
  /**
   * The two refs the branch comparison dialog is showing, or `null` when it is closed.
   *
   * Held here — rather than in the graph's `pendingGraphAction` bridge like the commit-scoped
   * dialogs — because a comparison has no commit: routing it through that bridge would make it
   * depend on a *selected graph row* that exists in the loaded page, and it would then silently do
   * nothing while the graph is unmounted (with the file explorer open). `RepoView` renders the
   * dialog from this state instead, the same reasoning that put the tag dialogs there.
   * Session-scoped, not persisted: a dialog should not reopen itself on the next launch.
   */
  compareRefsTarget: CompareRefsTarget | null
  setCompareRefsTarget: (target: CompareRefsTarget | null) => void
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

  /**
   * A commit whose full context menu some out-of-tree UI wants opened — set by the sidebar's tag
   * rows, consumed and cleared by the graph.
   *
   * The commit menu is built from the graph's loaded page (branch submenus, solo distance, the
   * selection), so it can't be lifted out; routing the *request* in instead keeps one definition of
   * the menu rather than a second, drifting copy. It follows that nothing happens while the graph
   * is unmounted — the file explorer being open, notably.
   */
  pendingCommitMenuOid: string | null
  setPendingCommitMenuOid: (oid: string | null) => void

  setActiveRepo: (path: string | null) => void
  setActiveTab: (id: string) => void
  openTab: (path: string) => void
  /** Appends an empty "New Tab" placeholder and focuses it (⌘T / Ctrl+T). */
  openNewTab: () => void
  closeTab: (path: string) => void
  reorderTabs: (from: number, to: number) => void
  /** Clears tab/selection state referencing a repo that's being fully removed. Called from
   * repoData.store's `removeRepo` (cross-store side effect) rather than duplicated there. */
  clearTabStateForRemovedRepo: (path: string) => void
}

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

      setSelectedStashIndex: (index) => set({ selectedStashIndex: index }),

      setPendingGraphAction: (action) => set({ pendingGraphAction: action }),
      setPendingCommitMenuOid: (oid) => set({ pendingCommitMenuOid: oid }),

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
          selectedStashIndex: null,
          pendingGraphAction: null,
          pendingCommitMenuOid: null,
        })
      },

      setActiveTab: (id) => {
        closeRepoScopedPanels()
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
          selectedStashIndex: null,
          pendingGraphAction: null,
          pendingCommitMenuOid: null,
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
        // The tab's graph/terminal/settings selection dies with it — a reopened tab starts on the
        // graph rather than on the terminal view whose sessions were killed with the old tab.
        useRepoViewTabsStore.getState().clearForPath(path)
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
        useRepoViewTabsStore.getState().clearForPath(path)
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
