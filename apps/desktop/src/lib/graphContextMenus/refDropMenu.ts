import { menuItem, menuSubmenu, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type { TranslateFn } from './types'

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
    menuItem({
      text: t('gitTree.dragDrop.merge', p),
      enabled: ctx.targetIsBranch,
      action: actions.onMerge,
    }),
    menuItem({
      text: t('gitTree.dragDrop.rebase', p),
      enabled: ctx.sourceIsBranch,
      action: actions.onRebase,
    }),
    menuItem({
      text: t('gitTree.dragDrop.interactiveRebase', p),
      enabled: ctx.sourceIsBranch,
      action: actions.onInteractiveRebase,
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.dragDrop.push', p),
      enabled: ctx.sourceIsBranch,
      action: actions.onPush,
    }),
    menuSubmenu({
      text: t('gitTree.dragDrop.resetSubmenu', p),
      enabled: ctx.sourceIsBranch,
      items: [
        menuItem({ text: t('gitTree.dragDrop.resetSoft'), action: () => actions.onReset('soft') }),
        menuItem({
          text: t('gitTree.dragDrop.resetMixed'),
          action: () => actions.onReset('mixed'),
        }),
        menuItem({ text: t('gitTree.dragDrop.resetHard'), action: () => actions.onReset('hard') }),
      ],
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.dragDrop.startPr', p),
      enabled: ctx.prEnabled,
      action: actions.onStartPr,
    }),
  ]
}
