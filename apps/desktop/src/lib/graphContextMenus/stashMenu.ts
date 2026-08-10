import { menuItem, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type { TranslateFn } from './types'

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
