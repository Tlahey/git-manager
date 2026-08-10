import { menuItem, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type { TranslateFn } from './types'

// ── Conflict (paused rebase) row menu ────────────────────────────────────────

export interface ConflictMenuContext {
  /** No conflicted files remain — mirrors `ConflictResolutionPanel`'s `allResolved` and enables
   *  "Continue". True for an `edit_pause` too, which never had conflicts to begin with. */
  allResolved: boolean
  /** Nothing has been staged yet and at least one file is still conflicted — mirrors the panel's
   *  `noneResolved` and enables "Skip". Once any file has been resolved, neither this nor
   *  `allResolved` holds and only "Abort" remains, exactly as in the panel: skipping
   *  mid-resolution would discard work already staged, and continuing isn't possible while
   *  conflicts are still open. */
  noneResolved: boolean
}

export interface ConflictMenuActions {
  onContinue: () => void
  onSkip: () => void
  onAbort: () => void
}

/**
 * Right-click menu of the CONFLICT row (a paused rebase/merge): the same three ways out that
 * `ConflictResolutionPanel` offers, as a shortcut that doesn't require opening the panel first.
 * Enablement mirrors the panel's own gating exactly (see `ConflictMenuContext`), so the menu never
 * offers something the panel wouldn't.
 */
export function buildConflictMenuSpec(
  ctx: ConflictMenuContext,
  actions: ConflictMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({
      text: t('gitTree.conflictMenu.continueRebase'),
      enabled: ctx.allResolved,
      action: actions.onContinue,
    }),
    menuItem({
      text: t('gitTree.conflictMenu.skipCommit'),
      enabled: ctx.noneResolved,
      action: actions.onSkip,
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.conflictMenu.abortRebase'),
      action: actions.onAbort,
    }),
  ]
}
