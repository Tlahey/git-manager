import { menuItem, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type { TranslateFn } from './types'

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
 * here. The CONFLICT row has its own menu (see `buildConflictMenuSpec`); a linked worktree's
 * `WIP:<path>` row still has none.
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
