import type { GitRef } from '@git-manager/git-types'

export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

// ── Context ──────────────────────────────────────────────────────────────────

export interface GraphCommitMenuContext {
  /** Exactly one commit targeted (multi-select disables most commit-scoped items). */
  isSingle: boolean
  targetCount: number
  /**
   * Whether the clicked commit has more than one parent. Two things depend on it, and both exist
   * because a merge has no single "before" state: the revert entry is relabelled (it opens the same
   * dialog, which then asks which parent is the mainline — `git revert -m`), and the "compare
   * against parent N" entries appear.
   *
   * The compare entries cover the first TWO parents only, which is every merge a GUI realistically
   * produces; an octopus merge's later sides stay unreachable from the menu (the revert dialog does
   * enumerate all of them, because `-m` has to name the real one).
   */
  isMergeCommit: boolean
  /** Every ref on the clicked commit — each branch/remote ref gets its own submenu. */
  refs: GitRef[]
  /** Current HEAD branch name, or `null` when detached — gates the relationship actions. */
  currentBranch: string | null
  isDetached: boolean
  /**
   * The current branch as a ref (pointing at its own tip, not necessarily the clicked commit), or
   * `null` when detached. Used as the flat menu's branch when the clicked commit carries no branch
   * label of its own — i.e. a commit that is *on* the current branch but isn't its tip. This is
   * what makes an ordinary history commit still expose the branch actions (relative to HEAD)
   * instead of the bare no-branch menu.
   */
  currentBranchRef: GitRef | null
  /**
   * Whether AI features are on (the Settings master switch). Only gates the "explain branch
   * changes" item — it is disabled rather than hidden, so the capability stays discoverable for
   * someone who has never opened the AI settings.
   */
  aiEnabled: boolean
  /** Short SHA of the right-clicked commit — named in the "recompose children" entry. */
  primaryShortOid: string
  /** How many commits descend from the clicked one on the current branch. Zero on a tip commit,
   * which is what hides the "children" entry rather than offering to rewrite nothing. */
  descendantCount: number
  /** True when HEAD's branch is in the repo's protected list — history rewriting is refused. */
  isOnProtectedBranch: boolean
}

// ── Actions ──────────────────────────────────────────────────────────────────

/** The commit-scoped copy/patch callbacks a branch's copy section reuses (on the branch tip). */
export interface CommitCopyActions {
  onCopySha: () => void
  onCopyLink: () => void
  /**
   * Optional because `buildSidebarBranchMenuSpec` hand-spells its copy section without a "Create
   * patch" item — "a row's menu carries the four copies and not the patch, which belongs to a
   * commit the user pointed at in the graph" (see that builder's comment) — so its hook has nothing
   * to wire this to. The graph's own copy section (`copySection`) still requires it in practice.
   */
  onCreatePatch?: () => void
}

/**
 * The commit-scoped actions a *branch* menu can offer on the branch's own tip — everything that
 * still makes sense when the user pointed at a branch rather than at a row in the graph.
 */
export interface BranchTipCommitActions extends CommitCopyActions {
  onCreateBranch: () => void
  onCherryPick: () => void
  onReset: (mode: 'soft' | 'mixed' | 'hard') => void
  onRevert: () => void
  onCreateTag: () => void
  onCreateAnnotatedTag: () => void
  /** Compare the commit against the working directory. */
  onCompareToWorkdir: () => void
}

export interface CommitMenuActions extends BranchTipCommitActions {
  onCheckout: () => void
  onCreateWorktree: () => void
  /** Opens the AI explanation of the clicked commit's own diff (vs its first parent). */
  onExplainCommit: () => void
  /** Rewrites the clicked commit's message with the model; `includeChildren` extends that to every
   * commit descending from it on the current branch. Both open the same review dialog — nothing is
   * written until the user confirms. */
  onRecomposeCommit: (includeChildren: boolean) => void
  // ── Multi-selection only ──
  /** Cherry-pick every selected commit (oldest→newest). */
  onCherryPickSelection: () => void
  /** Rebase the current branch onto the primary (right-clicked) commit. */
  onRebaseOntoCommit: () => void
  /** Write a single patch spanning all selected commits. */
  onCreatePatchSelection: () => void
  // ── Merge commits only ──
  /** Diff the merge commit against one of its parents; `parentNumber` is 1-based, as in `-m`. */
  onCompareToParent: (parentNumber: number) => void
}

/** Per-branch actions; each receives the branch ref the item belongs to. */
export interface BranchMenuActions {
  onPull: (ref: GitRef) => void
  onPush: (ref: GitRef) => void
  /** Opens the "Set upstream" dialog (or applies the obvious default) for this local branch. */
  onSetUpstream: (ref: GitRef) => void
  onFastForward: (ref: GitRef) => void
  onMergeInto: (ref: GitRef) => void
  onRebaseOntoBranch: (ref: GitRef) => void
  onCheckoutBranch: (ref: GitRef) => void
  onOpenWorktreeFrom: (ref: GitRef) => void
  /** Opens the PR-create flow with the current branch as head and this ref as base. */
  onStartPr: (ref: GitRef) => void
  /** Opens the branch-vs-branch diff with this ref as the "from" side, the other side pickable. */
  onCompareWithBranch: (ref: GitRef) => void
  /** Opens the AI explanation of everything this branch changes vs its merge target. */
  onExplainBranch: (ref: GitRef) => void
  /**
   * Opens the AI review of everything this branch changes vs its merge target. Optional because
   * `buildSidebarBranchMenuSpec` never renders a "Review branch changes" item — only the graph's own
   * branch menu (`prAndExplainSection`) offers both explain and review, deliberately, per its
   * builder's history (see `4b724da9`) — so the sidebar's hook has nothing to wire this to.
   */
  onReviewBranch?: (ref: GitRef) => void
  onRenameBranch: (ref: GitRef) => void
  onDeleteBranch: (ref: GitRef) => void
  onCopyBranchName: (ref: GitRef) => void
  onCopyBranchLink: (ref: GitRef) => void
  onPinToLeft: (ref: GitRef) => void
  /** Isolate this branch in the graph (solo mode): enable solo and show only its history. */
  onSolo: (ref: GitRef) => void
}
