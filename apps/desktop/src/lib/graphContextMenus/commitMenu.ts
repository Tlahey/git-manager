import type { GitRef } from '@git-manager/git-types'
import { soleLogicalBranch } from './refHelpers'
import { menuItem, menuSubmenu, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import {
  branchItemContext,
  branchRefs,
  buildBranchSubmenus,
  comparisonSection,
  copySection,
  destructiveSection,
  prAndExplainSection,
  relationshipSection,
  syncSection,
  tailSection,
} from './branchSections'
import type {
  BranchMenuActions,
  BranchTipCommitActions,
  CommitMenuActions,
  GraphCommitMenuContext,
  TranslateFn,
} from './types'

// ── Commit menu ──────────────────────────────────────────────────────────────

/** The commit-scoped core shared by every layout: create branch / cherry-pick / reset ▸ / revert. */
export function commitCoreSection(
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
    menuItem({
      text: t('gitTree.contextMenu.cherryPick'),
      enabled: isSingle,
      action: actions.onCherryPick,
    }),
    menuSubmenu({
      text: t('gitTree.contextMenu.resetSubmenu', { branch: ctx.currentBranch ?? 'HEAD' }),
      enabled: isSingle,
      items: [
        menuItem({
          text: t('gitTree.contextMenu.resetSoft'),
          action: () => actions.onReset('soft'),
        }),
        menuItem({
          text: t('gitTree.contextMenu.resetMixed'),
          action: () => actions.onReset('mixed'),
        }),
        menuItem({
          text: t('gitTree.contextMenu.resetHard'),
          action: () => actions.onReset('hard'),
        }),
      ],
    }),
    // Same entry and same dialog for a merge, only relabelled: the dialog is what asks which parent
    // is the mainline, because that question has no answer until the user is looking at the commit.
    menuItem({
      text: t(ctx.isMergeCommit ? 'gitTree.contextMenu.revertMerge' : 'gitTree.contextMenu.revert'),
      icon: 'revert',
      enabled: isSingle,
      action: actions.onRevert,
    }),
  ]
}

/**
 * "Compare against parent 1 / 2" — merge commits only, and only in the graph's own commit menu.
 *
 * A merge is the one commit whose diff is a question rather than a fact: it has one reading per
 * parent and the details panel silently picks the first. These entries are how the second one is
 * reachable at all. See {@link GraphCommitMenuContext.isMergeCommit} for why the list stops at two.
 */
export function mergeCompareSection(
  ctx: GraphCommitMenuContext,
  actions: CommitMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  if (!ctx.isMergeCommit || !ctx.isSingle) return []
  return [1, 2].map((parentNumber) =>
    menuItem({
      text: t('gitTree.contextMenu.compareToParent', { parent: parentNumber }),
      action: () => actions.onCompareToParent(parentNumber),
    })
  )
}

/**
 * The AI explanation of the clicked commit. Its own section so it can sit directly beside the branch
 * explanation (`prAndExplainSection`) with no separator between them: the two answer neighbouring
 * questions — "what does this commit do" and "what does its branch do" — and belong side by side.
 *
 * Stays at the TOP level rather than joining that section, because it is commit-scoped: nested in a
 * per-branch submenu it would appear once per branch, all of them meaning the same thing.
 */
export function commitExplanationSection(
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
export function commitRecomposeSection(
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

export function tagCreationSection(
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
export function buildFlatSingleBranchMenuSpec(
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
    // "Checkout origin/x", as in the multi-branch submenu. Only for a remote-only tip: this layout
    // is chosen when the commit carries ONE logical branch, and `soleLogicalBranch` prefers the
    // local ref, so `isRemote` here means the branch exists on the remote alone. Without it the
    // only checkout offered was the commit-scoped one below, which detaches HEAD — the very thing
    // `checkoutRemoteBranchAsLocal` exists to stop this gesture from doing.
    b.isRemote &&
      menuItem({
        text: t('gitTree.branchMenu.checkout', b.params),
        action: () => branchActions.onCheckoutBranch(b.ref),
      }),
    menuItem({ text: t('gitTree.contextMenu.checkout'), action: actions.onCheckout }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.createWorktree'),
      action: actions.onCreateWorktree,
    }),
    menuSeparator(),
    ...commitCoreSection(ctx, actions, t),
    // Directly under the (relabelled) revert entry, no separator: on a merge the two are the same
    // subject — which side of the merge is being talked about.
    ...mergeCompareSection(ctx, actions, t),
    menuSeparator(),
    ...comparisonSection(b, branchActions, t),
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
  const flatBranch =
    soleLogicalBranch(ownBranches) ?? (ownBranches.length === 0 ? ctx.currentBranchRef : null)
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
    ...mergeCompareSection(ctx, actions, t),
    menuSeparator(),
    ...commitExplanationSection(ctx, actions, t),
    menuSeparator(),
    ...commitRecomposeSection(ctx, actions, t),
    menuSeparator(),
    ...(branchSubmenus.length > 0
      ? branchSubmenus
      : [
          menuItem({
            text: t('gitTree.contextMenu.copySha'),
            icon: 'copy_sha',
            action: actions.onCopySha,
          }),
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
        menuItem({
          text: t('gitTree.contextMenu.resetSoft'),
          action: () => actions.onReset('soft'),
        }),
        menuItem({
          text: t('gitTree.contextMenu.resetMixed'),
          action: () => actions.onReset('mixed'),
        }),
        menuItem({
          text: t('gitTree.contextMenu.resetHard'),
          action: () => actions.onReset('hard'),
        }),
      ],
    }),
    menuItem({ text: t('gitTree.contextMenu.revert'), icon: 'revert', action: actions.onRevert }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.copySha'),
      icon: 'copy_sha',
      action: actions.onCopySha,
    }),
    menuItem({ text: t('gitTree.contextMenu.copyLink'), action: actions.onCopyLink }),
    menuItem({
      text: t('gitTree.contextMenu.createPatchMany'),
      action: actions.onCreatePatchSelection,
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.compareToWorkdir'),
      action: actions.onCompareToWorkdir,
    }),
    menuSeparator(),
    ...tagCreationSection(ctx, actions, t),
  ]
}
