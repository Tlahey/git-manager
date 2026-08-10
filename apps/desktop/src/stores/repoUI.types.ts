import type { MockIssue } from '../lib/github/types'
import type { PendingDeleteRemoteBranch } from '../lib/graphContextMenus'

/**
 * The shape of the repo tab's UI state, and the payloads its actions carry.
 *
 * Split out of `repoUI.store.ts` because it was half of a 697-line file — two hundred lines of
 * interface, each field carrying the doc comment that says what it is for and, more often than not,
 * why it exists at all. Reading the actions meant scrolling past all of it first.
 *
 * The *actions* deliberately stay in one store rather than becoming zustand slices: their whole job
 * is to keep mutually exclusive claimants of the same panel consistent — opening a file diff drops
 * the PR view, its composer and its file selection; opening a PR view drops the diff — and those
 * fields would land in different slices. A slice split would either duplicate that coordination or
 * have each slice reach into the others, which is worse than one file that states it once.
 */

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
 * A tag-scoped dialog awaiting confirmation or input, or `null` for "no dialog open".
 *
 * Sibling of {@link GraphCommitAction}, and separate from it for the reason that decides where
 * both are mounted: a commit action needs its commit to exist in the graph's *loaded page*, while
 * these need only the tag itself. See `pendingTagDialog` on the store.
 */
export type TagDialogAction =
  | { kind: 'annotate'; tagName: string; oid: string; shortOid: string }
  | { kind: 'deleteRemote'; tagName: string; oid: string; remote: string }
  | null

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

export interface RepoUIState {
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
   * OIDs of the real commits in the graph's current *multi*-selection, in graph order (newest
   * first) — a mirror of `useCommitSelection`'s local `selected` set, published by `GitGraph` so
   * out-of-tree UI (the command palette's "create patch from selection") can act on the whole
   * selection, which `selectedCommitOid` alone (the primary row) cannot describe. Empty unless two
   * or more real commits are selected: a single selection is already covered by `selectedCommitOid`,
   * and the synthetic WIP/CONFLICT rows never join a group (see `useCommitSelection`).
   */
  selectedCommitOids: string[]
  setSelectedCommitOids: (oids: string[]) => void
  /**
   * Stash index (parsed from `stash@{N}`) when the selected row is a stash entry, `null` otherwise —
   * published alongside `selectedCommitOid` so out-of-tree UI can offer stash-scoped actions
   * (apply/pop/drop) without duplicating the stash-detection logic already in
   * `useGraphRowMenus.ts`'s native-menu path.
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

  /**
   * The two ref-scoped dialogs — a tag's annotate/remote-delete, and a remote branch's delete —
   * awaiting confirmation, or `null` for "no dialog open".
   *
   * They live here rather than in the menu hooks for the same reason the branch-comparison dialog
   * is mounted by `RepoWorkspace`: they are about a **ref**, not about a commit in the graph's
   * loaded page, so they must stay open — and openable — while the file explorer has `GitGraph`
   * unmounted. Held as component state they were owned *twice*, once by the graph and once by the
   * workspace, and the graph's copy took its open dialog down with it the moment the user opened
   * the file explorer.
   *
   * One store field means one mount site: `RepoWorkspace` renders these, and `GitGraph` must
   * not — two mounts of one shared value draw the dialog twice.
   */
  pendingTagDialog: TagDialogAction
  setPendingTagDialog: (action: TagDialogAction) => void
  pendingRemoteBranchDelete: PendingDeleteRemoteBranch
  setPendingRemoteBranchDelete: (target: PendingDeleteRemoteBranch) => void
  /**
   * The local branch whose rename dialog is open, or `null`. Third of the ref-scoped dialogs above,
   * held here for the same reason and — since it is only ever a branch name — as a bare string.
   *
   * It was the one that stayed `useState` inside `useSidebarBranchMenu`, which made the sidebar's
   * context menu the only thing in the app able to open it: the command palette offers the branch
   * actions from anywhere, and it has no way to reach another hook's local state. `RepoWorkspace`
   * still mounts `RenameBranchDialog` exactly once, now from this slot.
   */
  pendingBranchRename: string | null
  setPendingBranchRename: (branch: string | null) => void

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
