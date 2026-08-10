import { menuItem, menuSubmenu, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type { TranslateFn } from './types'

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
  /** Copies the SHA of the commit the tag points at — same action/icon as the commit and branch
   * menus' own copy-SHA item. */
  onCopySha: () => void
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
    menuItem({
      text: t('gitTree.tagMenu.fastForward', p),
      enabled: rel,
      action: actions.onFastForward,
    }),
    menuItem({ text: t('gitTree.tagMenu.merge', p), enabled: rel, action: actions.onMerge }),
    menuItem({ text: t('gitTree.tagMenu.rebase', p), enabled: rel, action: actions.onRebase }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.checkout', p), action: actions.onCheckout }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.explain'), action: actions.onExplain }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.contextMenu.createBranch'),
      icon: 'branch',
      action: actions.onCreateBranch,
    }),
    menuItem({ text: t('gitTree.contextMenu.cherryPick'), action: actions.onCherryPick }),
    menuSubmenu({
      text: t('gitTree.tagMenu.resetSubmenu', p),
      enabled: rel,
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
    menuItem({ text: t('gitTree.tagMenu.deleteLocal', p), action: actions.onDeleteLocal }),
    menuItem({ text: t('gitTree.tagMenu.deleteRemote', p), action: actions.onDeleteRemote }),
    menuSeparator(),
    menuItem({ text: t('gitTree.tagMenu.copyName'), action: actions.onCopyName }),
    menuItem({
      text: t('gitTree.contextMenu.copySha'),
      icon: 'copy_sha',
      action: actions.onCopySha,
    }),
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
