import type { GitRef } from '@git-manager/git-types'
import { menuItem, menuSubmenu, menuSeparator, type MenuSpecEntry } from './nativeMenuSpec'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Context-driven CONFIGURATION of the graph's native context menus.
 *
 * Every rule about what the commit menu contains — and how it adapts to what was clicked (number
 * of selected commits, merge commit or not, which branches sit on the commit, local vs remote
 * branch, current branch or not, detached HEAD...) — lives here as pure functions returning a
 * `MenuSpecEntry[]` (see `nativeMenuSpec.ts`), rendered by `showNativeMenu` in
 * `api/nativeMenu.api.ts`. Adding a context-specific item = one predicate + one entry in the
 * relevant builder; no Tauri code involved, and the result is directly unit-testable.
 *
 * Items shipped as VISIBLE BUT DISABLED are planned features without an implementation yet
 * (Set upstream, Explain branch changes, Solo, remote-branch deletion) — they keep the menu shape
 * stable so wiring one later is only an `enabled`/`action` change here.
 */

// ── Context ──────────────────────────────────────────────────────────────────

export interface GraphCommitMenuContext {
  /** Exactly one commit targeted (multi-select disables most commit-scoped items). */
  isSingle: boolean
  targetCount: number
  /**
   * Merge commits currently share the regular commit menu; the flag is carried in the context so
   * a future merge-specific rule is a one-line predicate in `buildCommitMenuSpec`.
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
  onCreatePatch: () => void
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
}

/** Per-branch actions; each receives the branch ref the item belongs to. */
export interface BranchMenuActions {
  onPull: (ref: GitRef) => void
  onPush: (ref: GitRef) => void
  onFastForward: (ref: GitRef) => void
  onMergeInto: (ref: GitRef) => void
  onRebaseOntoBranch: (ref: GitRef) => void
  onCheckoutBranch: (ref: GitRef) => void
  onOpenWorktreeFrom: (ref: GitRef) => void
  /** Opens the PR-create flow with the current branch as head and this ref as base. */
  onStartPr: (ref: GitRef) => void
  /** Opens the AI explanation of everything this branch changes vs its merge target. */
  onExplainBranch: (ref: GitRef) => void
  /** Opens the AI review of everything this branch changes vs its merge target. */
  onReviewBranch: (ref: GitRef) => void
  onRenameBranch: (ref: GitRef) => void
  onDeleteBranch: (ref: GitRef) => void
  onCopyBranchName: (ref: GitRef) => void
  onCopyBranchLink: (ref: GitRef) => void
  onPinToLeft: (ref: GitRef) => void
  /** Isolate this branch in the graph (solo mode): enable solo and show only its history. */
  onSolo: (ref: GitRef) => void
}

// ── Rules ────────────────────────────────────────────────────────────────────

/** The repo's protected primary branch (local `main`/`master` or its remote counterpart). */
export const isMainBranchName = (shortName: string): boolean =>
  shortName === 'main' ||
  shortName === 'master' ||
  shortName.endsWith('/main') ||
  shortName.endsWith('/master')

/** Everything the per-branch sections need to decide their items, derived once per branch ref. */
interface BranchItemContext {
  ref: GitRef
  isRemote: boolean
  isCurrent: boolean
  hasCurrent: boolean
  /**
   * The name of the branch's canonical remote tree page, when it has one: the remote ref itself
   * for a remote branch, and for the local `main`/`master` its remote counterpart (`origin/main`).
   * A plain local feature branch has none — so only main/master exposes "Copy link to branch",
   * matching the spec. `null` otherwise.
   */
  remoteBranchLinkName: string | null
  params: { branch: string; current: string }
  /** Mirrors `GraphCommitMenuContext.aiEnabled`, carried per branch so the sections stay pure. */
  aiEnabled: boolean
  /**
   * Whether this branch actually sits on the clicked commit, as opposed to being the current-branch
   * fallback the flat menu uses for a commit with no label of its own. Branch *operations* are still
   * meaningful in that fallback (pull/push/merge are relative to HEAD by nature), but explaining "the
   * branch" is not: the user clicked a commit, and the branch they'd be told about is whichever one
   * happens to be checked out.
   */
  isOnClickedCommit: boolean
}

function branchItemContext(ref: GitRef, ctx: GraphCommitMenuContext): BranchItemContext {
  const isRemote = ref.type === 'remote'
  const remoteBranchLinkName = isRemote
    ? ref.shortName
    : isMainBranchName(ref.shortName)
      ? // Prefer the actual remote-tracking ref on the commit; fall back to `origin/<name>`.
        (ctx.refs.find((r) => r.type === 'remote' && logicalBranchName(r) === ref.shortName)
          ?.shortName ?? `origin/${ref.shortName}`)
      : null
  return {
    ref,
    isRemote,
    isCurrent: !isRemote && ref.shortName === ctx.currentBranch,
    hasCurrent: !!ctx.currentBranch && !ctx.isDetached,
    remoteBranchLinkName,
    params: { branch: ref.shortName, current: ctx.currentBranch ?? '' },
    aiEnabled: ctx.aiEnabled,
    isOnClickedCommit: ctx.refs.some((r) => r.name === ref.name),
  }
}

// ── Per-branch sections (shared by the submenu and the flat single-branch layout) ──

/** Pull / Push / Set upstream — local branches only; pull/push act on HEAD, so they stay
 *  disabled on a non-current branch. Set upstream is not implemented yet. */
function syncSection(b: BranchItemContext, actions: BranchMenuActions, t: TranslateFn): MenuSpecEntry[] {
  if (b.isRemote) return []
  return [
    menuItem({
      text: t('gitTree.branchMenu.pull'),
      enabled: b.isCurrent,
      action: () => actions.onPull(b.ref),
    }),
    menuItem({
      text: t('gitTree.branchMenu.push'),
      enabled: b.isCurrent,
      action: () => actions.onPush(b.ref),
    }),
    menuItem({ text: t('gitTree.branchMenu.setUpstream'), enabled: false }),
  ]
}

/** Fast-forward / Merge / Rebase against the current branch — meaningless on the current branch
 *  itself or with a detached HEAD. */
function relationshipSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  if (b.isCurrent || !b.hasCurrent) return []
  return [
    menuItem({
      text: t('gitTree.branchMenu.fastForward', b.params),
      action: () => actions.onFastForward(b.ref),
    }),
    menuItem({
      text: t('gitTree.branchMenu.mergeInto', b.params),
      action: () => actions.onMergeInto(b.ref),
    }),
    menuItem({
      text: t('gitTree.branchMenu.rebaseOnto', b.params),
      action: () => actions.onRebaseOntoBranch(b.ref),
    }),
  ]
}

/** "Push current & start a PR here" (remote only) + the AI branch explanation. */
function prAndExplainSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    b.isRemote &&
      b.hasCurrent &&
      menuItem({
        text: t('gitTree.branchMenu.startPr', b.params),
        action: () => actions.onStartPr(b.ref),
      }),
    b.isOnClickedCommit &&
      menuItem({
        text: t('gitTree.branchMenu.explainChanges'),
        enabled: b.aiEnabled,
        action: () => actions.onExplainBranch(b.ref),
      }),
    // Gated on the same condition as the explanation, for the same reason: reviewing "the branch"
    // when the user clicked an ordinary commit would review whichever branch happens to be checked
    // out, which is not what they pointed at.
    b.isOnClickedCommit &&
      menuItem({
        text: t('gitTree.branchMenu.reviewChanges'),
        enabled: b.aiEnabled,
        action: () => actions.onReviewBranch(b.ref),
      }),
  ]
}

/** Rename (local only) and Delete. Local: git refuses to delete the checked-out branch. Remote:
 *  real remote deletion needs its own confirmation flow — disabled until it exists. */
function destructiveSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    !b.isRemote &&
      menuItem({
        text: t('gitTree.branchMenu.rename', b.params),
        action: () => actions.onRenameBranch(b.ref),
      }),
    !b.isCurrent &&
      menuItem({
        text: t('gitTree.branchMenu.delete', b.params),
        enabled: !b.isRemote,
        action: () => actions.onDeleteBranch(b.ref),
      }),
  ]
}

function copySection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  commitActions: CommitCopyActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({
      text: t('gitTree.branchMenu.copyName'),
      action: () => actions.onCopyBranchName(b.ref),
    }),
    menuItem({
      text: t('gitTree.branchMenu.copyCommitSha'),
      icon: 'copy_sha',
      action: commitActions.onCopySha,
    }),
    b.remoteBranchLinkName
      ? menuItem({
          text: t('gitTree.branchMenu.copyBranchLink', { branch: b.remoteBranchLinkName }),
          action: () => actions.onCopyBranchLink(b.ref),
        })
      : false,
    menuItem({ text: t('gitTree.contextMenu.copyLink'), action: commitActions.onCopyLink }),
    menuItem({ text: t('gitTree.contextMenu.createPatch'), action: commitActions.onCreatePatch }),
  ]
}

/** Pin to left (wired to the pinned-branches store) + Solo (isolate this branch in the graph). */
function tailSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({
      text: t('gitTree.branchMenu.pinToLeft'),
      action: () => actions.onPinToLeft(b.ref),
    }),
    menuItem({
      text: t('gitTree.branchMenu.solo'),
      action: () => actions.onSolo(b.ref),
    }),
  ]
}

// ── Branch submenu (commit carrying SEVERAL branches) ────────────────────────

/**
 * One submenu per branch sitting on the clicked commit, mirroring GitKraken's layout — the flat
 * single-branch layout in `buildCommitMenuSpec` reuses the same sections.
 */
export function buildBranchSubmenu(
  ref: GitRef,
  ctx: GraphCommitMenuContext,
  actions: BranchMenuActions,
  commitActions: CommitMenuActions,
  t: TranslateFn
): MenuSpecEntry {
  const b = branchItemContext(ref, ctx)
  return menuSubmenu({
    text: ref.shortName,
    items: [
      ...syncSection(b, actions, t),
      menuSeparator(),
      ...relationshipSection(b, actions, t),
      menuSeparator(),
      b.isRemote &&
        menuItem({
          text: t('gitTree.branchMenu.checkout', b.params),
          action: () => actions.onCheckoutBranch(b.ref),
        }),
      menuSeparator(),
      menuItem({
        text: t('gitTree.branchMenu.openWorktree', b.params),
        action: () => actions.onOpenWorktreeFrom(b.ref),
      }),
      menuSeparator(),
      ...prAndExplainSection(b, actions, t),
      menuSeparator(),
      ...destructiveSection(b, actions, t),
      menuSeparator(),
      ...copySection(b, actions, commitActions, t),
      menuSeparator(),
      ...tailSection(b, actions, t),
    ],
  })
}

/** All branch submenus of the clicked commit (single-selection only). */
export function buildBranchSubmenus(
  ctx: GraphCommitMenuContext,
  actions: BranchMenuActions,
  commitActions: CommitMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  if (!ctx.isSingle) return []
  return branchRefs(ctx).map((r) => buildBranchSubmenu(r, ctx, actions, commitActions, t))
}

const branchRefs = (ctx: GraphCommitMenuContext): GitRef[] =>
  ctx.refs.filter((r) => r.type === 'branch' || r.type === 'remote')

/**
 * A standalone branch menu (no commit-scoped items) for right-clicking a branch **outside** the
 * graph — e.g. the repository sidebar. Reuses the exact same sections as the graph's per-branch
 * submenu, so the sidebar and the graph stay in sync. Unlike the graph submenu, it always offers
 * "Checkout `<branch>`" (switch to it — a local branch by name, a remote one detached), since a
 * sidebar branch isn't tied to a clicked commit. Copy/patch act on the branch tip.
 */
export function buildBranchMenuSpec(
  ref: GitRef,
  ctx: GraphCommitMenuContext,
  actions: BranchMenuActions,
  copyActions: CommitCopyActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const b = branchItemContext(ref, ctx)
  return [
    ...syncSection(b, actions, t),
    menuSeparator(),
    ...relationshipSection(b, actions, t),
    menuSeparator(),
    !b.isCurrent &&
      menuItem({
        text: t('gitTree.branchMenu.checkout', b.params),
        action: () => actions.onCheckoutBranch(b.ref),
      }),
    menuItem({
      text: t('gitTree.branchMenu.openWorktree', b.params),
      action: () => actions.onOpenWorktreeFrom(b.ref),
    }),
    menuSeparator(),
    ...prAndExplainSection(b, actions, t),
    menuSeparator(),
    ...destructiveSection(b, actions, t),
    menuSeparator(),
    ...copySection(b, actions, copyActions, t),
    menuSeparator(),
    ...tailSection(b, actions, t),
  ]
}

/** A remote branch row's extra context: whether its badge is currently kept out of the graph. */
export interface RemoteBranchMenuContext extends GraphCommitMenuContext {
  isHidden: boolean
}

export interface RemoteBranchMenuActions extends BranchMenuActions {
  /** Keeps this branch's badge out of the graph — the sidebar's eye toggle, as a menu entry. */
  onToggleVisibility: (ref: GitRef) => void
}

/**
 * The sidebar's **remote branch** menu: the branch sections above, plus the commit-scoped ones
 * acting on the branch tip (create branch / cherry-pick / reset ▸ / revert, compare, tags) and the
 * row's own Hide toggle.
 *
 * Wider than {@link buildBranchMenuSpec} because a remote branch row is the one place those commit
 * actions have an unambiguous target: the branch tip is a single commit the user can point at
 * without opening the graph. It reuses the same section builders, so an item added to the graph's
 * branch menu still lands here.
 */
export function buildRemoteBranchMenuSpec(
  ref: GitRef,
  ctx: RemoteBranchMenuContext,
  actions: RemoteBranchMenuActions,
  commitActions: BranchTipCommitActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const b = branchItemContext(ref, ctx)
  return [
    ...relationshipSection(b, actions, t),
    menuSeparator(),
    menuItem({
      text: t('gitTree.branchMenu.checkout', b.params),
      action: () => actions.onCheckoutBranch(b.ref),
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.branchMenu.openWorktree', b.params),
      action: () => actions.onOpenWorktreeFrom(b.ref),
    }),
    menuSeparator(),
    ...commitCoreSection(ctx, commitActions, t),
    menuSeparator(),
    ...prAndExplainSection(b, actions, t),
    menuSeparator(),
    ...destructiveSection(b, actions, t),
    menuSeparator(),
    ...copySection(b, actions, commitActions, t),
    menuSeparator(),
    menuItem({
      text: t(ctx.isHidden ? 'gitTree.branchMenu.show' : 'gitTree.branchMenu.hide'),
      action: () => actions.onToggleVisibility(b.ref),
    }),
    ...tailSection(b, actions, t),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.compareToWorkdir'),
      action: commitActions.onCompareToWorkdir,
    }),
    menuSeparator(),
    ...tagCreationSection(ctx, commitActions, t),
  ]
}

/** A branch ref's short name without the remote prefix (`origin/x` → `x`). */
const logicalBranchName = (ref: GitRef): string =>
  ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName

/**
 * The single logical branch a commit represents, or `null` when it has none or several. A local
 * branch and its remote-tracking counterpart (`main` + `origin/main`) share a logical name and so
 * count as ONE branch — that's what makes a *pushed* branch tip (two refs) still use the flat
 * single-branch layout instead of splitting into per-ref submenus. The local ref is preferred so
 * the flat menu exposes the local-branch actions (pull/push/rename/delete).
 */
function soleLogicalBranch(branchLike: GitRef[]): GitRef | null {
  if (branchLike.length === 0) return null
  const names = new Set(branchLike.map(logicalBranchName))
  if (names.size !== 1) return null
  return branchLike.find((r) => r.type === 'branch') ?? branchLike[0]
}

// ── WIP row menu ─────────────────────────────────────────────────────────────

export interface WipMenuContext {
  /** Something is staged (enables "Unstage all"). */
  hasStaged: boolean
  /** Something is unstaged or untracked (enables "Stage all"). */
  hasUnstaged: boolean
  /** Whether AI features are on — gates the explanation item, as elsewhere. */
  aiEnabled: boolean
}

export interface WipMenuActions {
  onStash: (includeUntracked: boolean) => void
  onStageAll: () => void
  onUnstageAll: () => void
  /** Opens the AI summary of everything currently uncommitted. */
  onExplainChanges: () => void
  /** Opens the AI review of everything currently uncommitted. */
  onReviewChanges: () => void
}

/**
 * Right-click menu of the **local** WIP row (the current branch's uncommitted changes): stash the
 * work in progress, stage/unstage everything, and the AI summary of the work in progress.
 * Committing stays on the row's inline input; "Discard all changes" lives on the side panel, not
 * here. Other synthetic rows (`WIP:<path>`, CONFLICT) have no menu.
 */
export function buildWipMenuSpec(
  ctx: WipMenuContext,
  actions: WipMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({ text: t('gitTree.wipMenu.stash'), action: () => actions.onStash(false) }),
    menuItem({
      text: t('gitTree.wipMenu.stashIncludeUntracked'),
      action: () => actions.onStash(true),
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.wipMenu.stageAll'),
      enabled: ctx.hasUnstaged,
      action: actions.onStageAll,
    }),
    menuItem({
      text: t('gitTree.wipMenu.unstageAll'),
      enabled: ctx.hasStaged,
      action: actions.onUnstageAll,
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.wipMenu.explainChanges'),
      // There is nothing to summarize on a clean tree, and nothing to ask when AI is off.
      enabled: ctx.aiEnabled && (ctx.hasStaged || ctx.hasUnstaged),
      action: actions.onExplainChanges,
    }),
    // Sits directly under the summary, no separator: the two read the same diff and answer the two
    // halves of the same moment — "what am I in the middle of?" then "is it alright to commit?".
    menuItem({
      text: t('gitTree.wipMenu.reviewChanges'),
      enabled: ctx.aiEnabled && (ctx.hasStaged || ctx.hasUnstaged),
      action: actions.onReviewChanges,
    }),
  ]
}

// ── Stash menu ─────────────────────────────────────────────────────────────

export interface StashMenuContext {
  /** Whether the stash is currently hidden in the graph (toggles the show/hide label). */
  isHidden: boolean
}

export interface StashMenuActions {
  onApply: () => void
  onPop: () => void
  onDelete: () => void
  onEditMessage: () => void
  onToggleVisibility: () => void
}

/** Right-click menu of a stash commit row (also reused by the sidebar's stash rows). */
export function buildStashMenuSpec(
  ctx: StashMenuContext,
  actions: StashMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({ text: t('gitTree.stashMenu.apply'), action: actions.onApply }),
    menuItem({ text: t('gitTree.stashMenu.pop'), action: actions.onPop }),
    menuItem({ text: t('gitTree.stashMenu.delete'), action: actions.onDelete }),
    menuSeparator(),
    menuItem({ text: t('gitTree.stashMenu.editMessage'), action: actions.onEditMessage }),
    menuItem({
      text: t(ctx.isHidden ? 'gitTree.stashMenu.show' : 'gitTree.stashMenu.hide'),
      action: actions.onToggleVisibility,
    }),
  ]
}

// ── Ref drag-and-drop menu ───────────────────────────────────────────────────

export interface RefDropMenuContext {
  /** Label params: dragged `source`, drop `target`, and the target's `remote`. */
  params: { source: string; target: string; remote: string }
  /** Fast-forward/merge move the target branch → target must be a local branch. */
  targetIsBranch: boolean
  /** Rebase/reset/push rewrite or publish the source branch → source must be local. */
  sourceIsBranch: boolean
  /** A PR needs branch heads on both sides — tags can't be a PR head or base. */
  prEnabled: boolean
}

export interface RefDropMenuActions {
  onFastForward: () => void
  onMerge: () => void
  onRebase: () => void
  onInteractiveRebase: () => void
  onPush: () => void
  onReset: (mode: 'soft' | 'mixed' | 'hard') => void
  onStartPr: () => void
}

/** Menu shown when one ref badge (branch/tag) is dropped onto another in the commit graph. */
export function buildRefDropMenuSpec(
  ctx: RefDropMenuContext,
  actions: RefDropMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const p = ctx.params
  return [
    menuItem({
      text: t('gitTree.dragDrop.fastForward', p),
      enabled: ctx.targetIsBranch,
      action: actions.onFastForward,
    }),
    menuItem({ text: t('gitTree.dragDrop.merge', p), enabled: ctx.targetIsBranch, action: actions.onMerge }),
    menuItem({ text: t('gitTree.dragDrop.rebase', p), enabled: ctx.sourceIsBranch, action: actions.onRebase }),
    menuItem({
      text: t('gitTree.dragDrop.interactiveRebase', p),
      enabled: ctx.sourceIsBranch,
      action: actions.onInteractiveRebase,
    }),
    menuSeparator(),
    menuItem({ text: t('gitTree.dragDrop.push', p), enabled: ctx.sourceIsBranch, action: actions.onPush }),
    menuSubmenu({
      text: t('gitTree.dragDrop.resetSubmenu', p),
      enabled: ctx.sourceIsBranch,
      items: [
        menuItem({ text: t('gitTree.dragDrop.resetSoft'), action: () => actions.onReset('soft') }),
        menuItem({ text: t('gitTree.dragDrop.resetMixed'), action: () => actions.onReset('mixed') }),
        menuItem({ text: t('gitTree.dragDrop.resetHard'), action: () => actions.onReset('hard') }),
      ],
    }),
    menuSeparator(),
    menuItem({ text: t('gitTree.dragDrop.startPr', p), enabled: ctx.prEnabled, action: actions.onStartPr }),
  ]
}

// ── Tag menu ─────────────────────────────────────────────────────────────────

export interface TagMenuContext {
  /** Label params: the `tag`, current `branch`, and `remote`. */
  params: { tag: string; branch: string; remote: string }
  /** The relationship actions (fast-forward/merge/rebase/reset) act on the current branch — off
   * when detached. */
  relationEnabled: boolean
  /** Whether the tag's badge is currently kept out of the graph — picks Hide vs Show. */
  isHidden: boolean
}

export interface TagMenuActions {
  /** Publish the tag to the remote — `git push origin <tag>`. */
  onPush: () => void
  /** Re-point the tag at the current branch's tip (delete + re-create; local only). */
  onFastForward: () => void
  onMerge: () => void
  onRebase: () => void
  onCheckout: () => void
  /** AI explanation of the changes the tag's commit brings. */
  onExplain: () => void
  onCreateBranch: () => void
  onCherryPick: () => void
  onReset: (mode: 'soft' | 'mixed' | 'hard') => void
  onRevert: () => void
  onDeleteLocal: () => void
  onDeleteRemote: () => void
  onCopyName: () => void
  onCopyLink: () => void
  /** Keep the tag's badge out of the graph (or bring it back). */
  onToggleHidden: () => void
  /** Isolate the graph on the branch carrying the tag's commit. */
  onSolo: () => void
  onAnnotate: () => void
}

/**
 * The tag's action menu — used both by the graph's tag badge and by the sidebar's tag rows, so the
 * two can never drift into different menus.
 *
 * Ordering is deliberate and reads top-down as "publish it, move it, use it, understand it, branch
 * off it, delete it, copy it, hide it, describe it". The relationship actions (fast-forward, merge,
 * rebase, reset) are disabled while HEAD is detached, since they are all phrased against the
 * current branch.
 */
export function buildTagMenuSpec(
  ctx: TagMenuContext,
  actions: TagMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const p = ctx.params
  const rel = ctx.relationEnabled
  return [
    menuItem({ text: t('gitTree.tagMenu.push', p), action: actions.onPush }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.fastForward', p), enabled: rel, action: actions.onFastForward }),
    menuItem({ text: t('gitTree.tagMenu.merge', p), enabled: rel, action: actions.onMerge }),
    menuItem({ text: t('gitTree.tagMenu.rebase', p), enabled: rel, action: actions.onRebase }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.checkout', p), action: actions.onCheckout }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.explain'), action: actions.onExplain }),
    menuSeparator(),
    menuItem({ text: t('gitTree.contextMenu.createBranch'), icon: 'branch', action: actions.onCreateBranch }),
    menuItem({ text: t('gitTree.contextMenu.cherryPick'), action: actions.onCherryPick }),
    menuSubmenu({
      text: t('gitTree.tagMenu.resetSubmenu', p),
      enabled: rel,
      items: [
        menuItem({ text: t('gitTree.contextMenu.resetSoft'), action: () => actions.onReset('soft') }),
        menuItem({ text: t('gitTree.contextMenu.resetMixed'), action: () => actions.onReset('mixed') }),
        menuItem({ text: t('gitTree.contextMenu.resetHard'), action: () => actions.onReset('hard') }),
      ],
    }),
    menuItem({ text: t('gitTree.contextMenu.revert'), icon: 'revert', action: actions.onRevert }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.deleteLocal', p), action: actions.onDeleteLocal }),
    menuItem({ text: t('gitTree.tagMenu.deleteRemote', p), action: actions.onDeleteRemote }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.copyName'), action: actions.onCopyName }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.copyLink', p), action: actions.onCopyLink }),
    menuSeparator(),
    menuItem({
      text: t(ctx.isHidden ? 'gitTree.tagMenu.show' : 'gitTree.tagMenu.hide'),
      action: actions.onToggleHidden,
    }),
    menuItem({ text: t('gitTree.tagMenu.solo'), action: actions.onSolo }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.annotate', p), icon: 'tag', action: actions.onAnnotate }),
  ]
}

// ── Commit menu ──────────────────────────────────────────────────────────────

/** The commit-scoped core shared by every layout: create branch / cherry-pick / reset ▸ / revert. */
function commitCoreSection(
  ctx: GraphCommitMenuContext,
  actions: BranchTipCommitActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const { isSingle } = ctx
  return [
    menuItem({
      text: t('gitTree.contextMenu.createBranch'),
      icon: 'branch',
      enabled: isSingle,
      action: actions.onCreateBranch,
    }),
    menuItem({ text: t('gitTree.contextMenu.cherryPick'), enabled: isSingle, action: actions.onCherryPick }),
    menuSubmenu({
      text: t('gitTree.contextMenu.resetSubmenu', { branch: ctx.currentBranch ?? 'HEAD' }),
      enabled: isSingle,
      items: [
        menuItem({ text: t('gitTree.contextMenu.resetSoft'), action: () => actions.onReset('soft') }),
        menuItem({ text: t('gitTree.contextMenu.resetMixed'), action: () => actions.onReset('mixed') }),
        menuItem({ text: t('gitTree.contextMenu.resetHard'), action: () => actions.onReset('hard') }),
      ],
    }),
    menuItem({ text: t('gitTree.contextMenu.revert'), icon: 'revert', enabled: isSingle, action: actions.onRevert }),
  ]
}

/**
 * The AI explanation of the clicked commit. Its own section so it can sit directly beside the branch
 * explanation (`prAndExplainSection`) with no separator between them: the two answer neighbouring
 * questions — "what does this commit do" and "what does its branch do" — and belong side by side.
 *
 * Stays at the TOP level rather than joining that section, because it is commit-scoped: nested in a
 * per-branch submenu it would appear once per branch, all of them meaning the same thing.
 */
function commitExplanationSection(
  ctx: GraphCommitMenuContext,
  actions: CommitMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({
      text: t('gitTree.contextMenu.explainCommit'),
      enabled: ctx.isSingle && ctx.aiEnabled,
      action: actions.onExplainCommit,
    }),
  ]
}

/**
 * Rewriting commit messages with the model. Sits apart from {@link commitExplanationSection} despite
 * being commit-scoped and AI-driven, because it answers a different kind of question: the
 * explanations are read-only, and this one **rewrites history**.
 *
 * The "children" entry names its own count, which is what stops it reading as a vaguer version of
 * the single one — `descendantCount` is how many commits would be rewritten beyond the clicked one.
 * It is hidden rather than disabled when there are none: an entry offering to rewrite zero commits
 * is noise on every tip commit in the graph.
 *
 * Both are disabled on a detached HEAD (there is no branch to move) and on a protected branch, so
 * the menu says no before the dialog has to.
 */
function commitRecomposeSection(
  ctx: GraphCommitMenuContext,
  actions: CommitMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const allowed = ctx.isSingle && ctx.aiEnabled && !ctx.isDetached && !ctx.isOnProtectedBranch
  const entries: MenuSpecEntry[] = [
    menuItem({
      text: t('gitTree.contextMenu.recomposeOne'),
      enabled: allowed,
      action: () => actions.onRecomposeCommit(false),
    }),
  ]

  if (ctx.descendantCount > 0) {
    entries.push(
      menuItem({
        text: t('gitTree.contextMenu.recomposeMany', {
          count: ctx.descendantCount,
          sha: ctx.primaryShortOid,
        }),
        enabled: allowed,
        action: () => actions.onRecomposeCommit(true),
      })
    )
  }

  return entries
}

function tagCreationSection(
  ctx: GraphCommitMenuContext,
  actions: BranchTipCommitActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({
      text: t('gitTree.contextMenu.createTag'),
      icon: 'tag',
      enabled: ctx.isSingle,
      action: actions.onCreateTag,
    }),
    menuItem({
      text: t('gitTree.contextMenu.createAnnotatedTag'),
      icon: 'tag',
      enabled: ctx.isSingle,
      action: actions.onCreateAnnotatedTag,
    }),
  ]
}

/**
 * Single branch on the commit: its actions are FLATTENED into the commit menu (no submenu),
 * interleaved with the commit-scoped items — branch sync & relationship first, then the commit
 * core, then the branch's destructive/copy/pin tail, then tag creation.
 */
function buildFlatSingleBranchMenuSpec(
  ref: GitRef,
  ctx: GraphCommitMenuContext,
  actions: CommitMenuActions,
  branchActions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const b = branchItemContext(ref, ctx)
  return [
    ...syncSection(b, branchActions, t),
    menuSeparator(),
    ...relationshipSection(b, branchActions, t),
    menuSeparator(),
    menuItem({
      text: t('gitTree.branchMenu.openWorktree', b.params),
      action: () => branchActions.onOpenWorktreeFrom(b.ref),
    }),
    menuItem({ text: t('gitTree.contextMenu.checkout'), action: actions.onCheckout }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.createWorktree'),
      action: actions.onCreateWorktree,
    }),
    menuSeparator(),
    ...commitCoreSection(ctx, actions, t),
    menuSeparator(),
    // The two AI explanations, adjacent and unseparated.
    ...commitExplanationSection(ctx, actions, t),
    ...prAndExplainSection(b, branchActions, t),
    menuSeparator(),
    // Separated from the explanations above: same model, but this one rewrites history.
    ...commitRecomposeSection(ctx, actions, t),
    menuSeparator(),
    ...destructiveSection(b, branchActions, t),
    menuSeparator(),
    ...copySection(b, branchActions, actions, t),
    menuSeparator(),
    ...tailSection(b, branchActions, t),
    menuSeparator(),
    ...tagCreationSection(ctx, actions, t),
  ]
}

/**
 * The full commit right-click menu. Three layouts, decided by what sits on the clicked commit:
 *
 * - NO branch: checkout / worktree / core / copy-patch section / tag creation.
 * - ONE logical branch (and a single selection): the branch's actions are flattened inline — see
 *   `buildFlatSingleBranchMenuSpec`. A pushed branch tip (local `main` + `origin/main`) counts as
 *   one logical branch, so it flattens too (see `soleLogicalBranch`).
 * - SEVERAL branches: one submenu per branch between the core and the tag creation section.
 * - MULTI-SELECTION: a dedicated flat layout (`buildMultiCommitMenuSpec`) — commit-scoped actions
 *   act on the primary (right-clicked) commit; cherry-pick and patch span the whole selection.
 */
export function buildCommitMenuSpec(
  ctx: GraphCommitMenuContext,
  actions: CommitMenuActions,
  branchActions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const { isSingle } = ctx

  if (!isSingle) return buildMultiCommitMenuSpec(ctx, actions, t)

  // The flat single-branch layout applies to: (a) a commit carrying one logical branch, or
  // (b) a commit with NO branch label of its own but sitting on the current branch — then keyed to
  // the current branch (a plain history commit still gets the branch actions relative to HEAD).
  const ownBranches = branchRefs(ctx)
  const flatBranch = soleLogicalBranch(ownBranches) ?? (ownBranches.length === 0 ? ctx.currentBranchRef : null)
  if (flatBranch) {
    return buildFlatSingleBranchMenuSpec(flatBranch, ctx, actions, branchActions, t)
  }

  const branchSubmenus = buildBranchSubmenus(ctx, branchActions, actions, t)

  return [
    menuItem({ text: t('gitTree.contextMenu.checkout'), action: actions.onCheckout }),
    menuSeparator(),
    menuItem({ text: t('gitTree.contextMenu.createWorktree'), action: actions.onCreateWorktree }),
    menuSeparator(),
    ...commitCoreSection(ctx, actions, t),
    menuSeparator(),
    ...commitExplanationSection(ctx, actions, t),
    menuSeparator(),
    ...commitRecomposeSection(ctx, actions, t),
    menuSeparator(),
    ...(branchSubmenus.length > 0
      ? branchSubmenus
      : [
          menuItem({ text: t('gitTree.contextMenu.copySha'), icon: 'copy_sha', action: actions.onCopySha }),
          menuItem({ text: t('gitTree.contextMenu.copyLink'), action: actions.onCopyLink }),
          menuItem({ text: t('gitTree.contextMenu.createPatch'), action: actions.onCreatePatch }),
        ]),
    menuSeparator(),
    ...tagCreationSection(ctx, actions, t),
  ]
}

/**
 * The multi-selection commit menu. Commit-scoped actions (checkout, worktree, branch, reset,
 * revert, compare, tags, copy) target the **primary** (right-clicked) commit; cherry-pick and
 * patch span the **whole selection**. Rebase/reset are phrased against the current branch.
 */
export function buildMultiCommitMenuSpec(
  ctx: GraphCommitMenuContext,
  actions: CommitMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const branch = ctx.currentBranch ?? 'HEAD'
  return [
    menuItem({ text: t('gitTree.contextMenu.checkout'), action: actions.onCheckout }),
    menuSeparator(),
    menuItem({ text: t('gitTree.contextMenu.createWorktree'), action: actions.onCreateWorktree }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.createBranch'),
      icon: 'branch',
      action: actions.onCreateBranch,
    }),
    menuItem({
      text: t('gitTree.contextMenu.cherryPickMany', { count: ctx.targetCount }),
      action: actions.onCherryPickSelection,
    }),
    menuItem({
      text: t('gitTree.contextMenu.rebaseOntoCommit', { branch }),
      action: actions.onRebaseOntoCommit,
    }),
    menuSubmenu({
      text: t('gitTree.contextMenu.resetSubmenu', { branch }),
      items: [
        menuItem({ text: t('gitTree.contextMenu.resetSoft'), action: () => actions.onReset('soft') }),
        menuItem({ text: t('gitTree.contextMenu.resetMixed'), action: () => actions.onReset('mixed') }),
        menuItem({ text: t('gitTree.contextMenu.resetHard'), action: () => actions.onReset('hard') }),
      ],
    }),
    menuItem({ text: t('gitTree.contextMenu.revert'), icon: 'revert', action: actions.onRevert }),
    menuSeparator(),
    menuItem({ text: t('gitTree.contextMenu.copySha'), icon: 'copy_sha', action: actions.onCopySha }),
    menuItem({ text: t('gitTree.contextMenu.copyLink'), action: actions.onCopyLink }),
    menuItem({
      text: t('gitTree.contextMenu.createPatchMany'),
      action: actions.onCreatePatchSelection,
    }),
    menuSeparator(),
    menuItem({ text: t('gitTree.contextMenu.compareToWorkdir'), action: actions.onCompareToWorkdir }),
    menuSeparator(),
    ...tagCreationSection(ctx, actions, t),
  ]
}
