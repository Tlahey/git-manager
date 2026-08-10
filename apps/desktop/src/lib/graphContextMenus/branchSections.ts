import type { GitRef } from '@git-manager/git-types'
import { isMainBranchName, logicalBranchName } from './refHelpers'
import { menuItem, menuSubmenu, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type {
  BranchMenuActions,
  CommitCopyActions,
  CommitMenuActions,
  GraphCommitMenuContext,
  TranslateFn,
} from './types'

// ── Rules ────────────────────────────────────────────────────────────────────

/** Everything the per-branch sections need to decide their items, derived once per branch ref. */
export interface BranchItemContext {
  ref: GitRef
  isRemote: boolean
  isCurrent: boolean
  hasCurrent: boolean
  /**
   * The name of the branch's canonical remote tree page, when it has one: the remote ref itself
   * for a remote branch, and for a local branch its remote-tracking counterpart present on the
   * same commit (`origin/<name>`) — any pushed local branch, not just main/master. Local `main`/
   * `master` additionally falls back to the conventional `origin/<name>` even when no matching
   * remote ref is actually on the commit, since that pairing can be assumed. A local branch that
   * has never been pushed has none. `null` otherwise.
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

export function branchItemContext(ref: GitRef, ctx: GraphCommitMenuContext): BranchItemContext {
  const isRemote = ref.type === 'remote'
  // Any local branch whose remote-tracking ref is actually on the commit gets that ref's name;
  // main/master additionally fall back to the conventional `origin/<name>` even without one
  // present, since that pairing can be assumed. Any other local branch with no remote ref on the
  // commit — i.e. never pushed — has none.
  const remoteCounterpart = ctx.refs.find(
    (r) => r.type === 'remote' && logicalBranchName(r) === ref.shortName
  )?.shortName
  const remoteBranchLinkName = isRemote
    ? ref.shortName
    : (remoteCounterpart ?? (isMainBranchName(ref.shortName) ? `origin/${ref.shortName}` : null))
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

/** Pull / Push — local branches only, and only meaningful against HEAD, so both stay visible but
 *  disabled on a non-current branch (see `setUpstreamSection` for why "Set upstream" doesn't share
 *  that gate). */
export function pullPushSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
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
  ]
}

/**
 * Set upstream — local branches only, and always enabled: unlike pull/push it writes metadata on
 * the branch actually clicked (`branch.<name>.remote`/`.merge`), not on HEAD. That is what lets the
 * sidebar offer it on every local branch row instead of gating it to the trunk the way pull/push
 * are (see `buildSidebarBranchMenuSpec`) — the item does exactly what its row says regardless of
 * what is currently checked out.
 */
export function setUpstreamSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  if (b.isRemote) return []
  return [
    menuItem({
      text: t('gitTree.branchMenu.setUpstream'),
      action: () => actions.onSetUpstream(b.ref),
    }),
  ]
}

/** Pull / Push / Set upstream, as one section for the graph's branch submenu and flat layout —
 *  the sidebar (`buildSidebarBranchMenuSpec`) uses the two halves separately instead, since only
 *  the pull/push half needs to be gated to the trunk. */
export function syncSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [...pullPushSection(b, actions, t), ...setUpstreamSection(b, actions, t)]
}

/** Fast-forward / Merge / Rebase against the current branch — meaningless on the current branch
 *  itself or with a detached HEAD. */
export function relationshipSection(
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

/**
 * "Compare <branch> with…" — the branch-vs-branch diff, opened with this branch as the "from" side
 * and the other one picked in the dialog.
 *
 * Always offered, on the current branch and on a remote one alike: unlike the relationship actions
 * above, comparing changes nothing, so there is no state in which the question is meaningless. It
 * needs no AI flag either — this reads the two trees, it does not ask a model about them.
 */
export function comparisonSection(
  b: BranchItemContext,
  actions: BranchMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({
      text: t('gitTree.branchMenu.compareWith', b.params),
      action: () => actions.onCompareWithBranch(b.ref),
    }),
  ]
}

/** "Push current & start a PR here" (remote only) + the AI branch explanation. */
export function prAndExplainSection(
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
        action: () => actions.onReviewBranch?.(b.ref),
      }),
  ]
}

/** Rename (local only) and Delete. Local: git refuses to delete the checked-out branch, and the
 *  action runs straight away (undo/redo covers it). Remote: `onDeleteBranch` routes through its
 *  own confirmation dialog rather than deleting outright — see `DeleteRemoteBranchDialog`. */
export function destructiveSection(
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
        action: () => actions.onDeleteBranch(b.ref),
      }),
  ]
}

export function copySection(
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
export function tailSection(
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
      ...comparisonSection(b, actions, t),
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

export const branchRefs = (ctx: GraphCommitMenuContext): GitRef[] =>
  ctx.refs.filter((r) => r.type === 'branch' || r.type === 'remote')

/** A sidebar branch row's extra context: whether its badge is currently kept out of the graph. */
