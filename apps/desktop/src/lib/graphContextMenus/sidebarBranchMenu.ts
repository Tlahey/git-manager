import type { GitRef } from '@git-manager/git-types'
import { isMainBranchName } from './refHelpers'
import { menuItem, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import {
  branchItemContext,
  comparisonSection,
  destructiveSection,
  pullPushSection,
  relationshipSection,
  setUpstreamSection,
  tailSection,
} from './branchSections'
import { commitCoreSection, tagCreationSection } from './commitMenu'
import type {
  BranchMenuActions,
  BranchTipCommitActions,
  GraphCommitMenuContext,
  TranslateFn,
} from './types'

export interface SidebarBranchMenuContext extends GraphCommitMenuContext {
  isHidden: boolean
}

export interface SidebarBranchMenuActions extends BranchMenuActions {
  /** Keeps this branch's badge out of the graph — the sidebar's eye toggle, as a menu entry. */
  onToggleVisibility: (ref: GitRef) => void
}

/**
 * The sidebar's **branch row** menu, local and remote alike: the branch sections above, plus the
 * commit-scoped ones acting on the branch tip (create branch / cherry-pick / reset ▸ / revert,
 * compare, tags) and the row's own Hide toggle.
 *
 * It carries the commit-scoped actions because a branch row is the one place they have an
 * unambiguous target: the branch tip is a single commit the user can point at without opening the
 * graph. It reuses the graph's own section builders, so an item added to the graph's branch
 * menu still lands here — and so the two rows differ only where the ref's own type says they should
 * (no pull/push on a remote, no rename, a disabled Delete).
 */
export function buildSidebarBranchMenuSpec(
  ref: GitRef,
  ctx: SidebarBranchMenuContext,
  actions: SidebarBranchMenuActions,
  commitActions: BranchTipCommitActions,
  t: TranslateFn
): MenuSpecEntry[] {
  const b = branchItemContext(ref, ctx)
  const isTrunk = !b.isRemote && isMainBranchName(ref.shortName)
  return [
    // Pull / push act on HEAD rather than on the row that was right-clicked, so they are offered
    // on the trunk — where they are what one actually runs — and nowhere else. Set upstream acts on
    // the row itself, so every local branch gets it, not just the trunk.
    ...(isTrunk ? pullPushSection(b, actions, t) : []),
    ...setUpstreamSection(b, actions, t),
    menuSeparator(),
    ...relationshipSection(b, actions, t),
    menuSeparator(),
    !b.isCurrent &&
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
    // The trunk is what a pull request targets, never what it is opened from — and a branch cannot
    // be a PR's base against itself either.
    !isTrunk &&
      !b.isCurrent &&
      b.hasCurrent &&
      menuItem({
        text: t('gitTree.branchMenu.startPr', b.params),
        action: () => actions.onStartPr(b.ref),
      }),
    menuItem({
      text: t('gitTree.branchMenu.explainChanges'),
      enabled: b.aiEnabled,
      action: () => actions.onExplainBranch(b.ref),
    }),
    menuSeparator(),
    ...destructiveSection(b, actions, t),
    menuSeparator(),
    // Spelled out rather than reusing the graph's copy section: a row's menu carries the four
    // copies and not the patch, which belongs to a commit the user pointed at in the graph.
    menuItem({
      text: t('gitTree.branchMenu.copyName'),
      action: () => actions.onCopyBranchName(b.ref),
    }),
    menuItem({
      text: t('gitTree.branchMenu.copyCommitSha'),
      icon: 'copy_sha',
      action: commitActions.onCopySha,
    }),
    !!b.remoteBranchLinkName &&
      menuItem({
        text: t('gitTree.branchMenu.copyBranchLink', { branch: b.remoteBranchLinkName }),
        action: () => actions.onCopyBranchLink(b.ref),
      }),
    menuItem({ text: t('gitTree.contextMenu.copyLink'), action: commitActions.onCopyLink }),
    menuSeparator(),
    menuItem({
      text: t(ctx.isHidden ? 'gitTree.branchMenu.show' : 'gitTree.branchMenu.hide'),
      action: () => actions.onToggleVisibility(b.ref),
    }),
    ...tailSection(b, actions, t),
    menuSeparator(),
    // The two comparisons, side by side: against another branch, and — for a remote tip only —
    // against the working directory. The latter is the question a remote tip raises ("what is on
    // the server that I do not have?") and a local one does not, since it can simply be checked out.
    ...comparisonSection(b, actions, t),
    b.isRemote &&
      menuItem({
        text: t('gitTree.contextMenu.compareToWorkdir'),
        action: commitActions.onCompareToWorkdir,
      }),
    menuSeparator(),
    ...tagCreationSection(ctx, commitActions, t),
  ]
}

/**
 * A remote branch awaiting its delete confirmation (the `destructiveSection`'s Delete item on a
 * remote ref), or `null` for "no dialog open". Both the graph's and the sidebar's branch-menu
 * hooks own one of these locally and render {@link DeleteRemoteBranchDialog} from it — unlike the
 * graph's other menu-triggered dialogs, this one needs no clicked-commit node to exist in the
 * loaded graph page (see `GitGraphOverlayManager`'s `activeNode` gate), only the ref itself, so it
 * stays outside that shared union.
 */
export type PendingDeleteRemoteBranch = { branchName: string; remote: string } | null
