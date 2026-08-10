import { menuItem, menuSeparator, type MenuSpecEntry } from '../nativeMenuSpec'
import type { TranslateFn } from './types'

// ── Other-worktree WIP row menu ───────────────────────────────────────────────

export interface OtherWorktreeMenuActions {
  /** Switches the graph/sidebar to render this worktree's data in place of the active repo tab —
   * the same view-switch the row's own "Open Worktree" button and the sidebar's worktree row use
   * (`activeWorkspacePath`), so right-clicking and clicking the button agree on what "open" means. */
  onOpenWorktree: () => void
  /** Stashes the OTHER worktree's uncommitted changes — never the active repo's. Safe because the
   * stash commands take an explicit path rather than reading `AppState`'s currently-open repo. */
  onStash: (includeUntracked: boolean) => void
  onRevealInFinder: () => void
}

/**
 * Right-click menu of a **`WIP:<path>`** row — another linked worktree's uncommitted changes,
 * rendered on its own lane in the graph. Every action targets that OTHER worktree's path, never the
 * active repo: opening it switches the current view onto it, and stashing writes to its own working
 * tree (the stash entry itself still lands in the shared `refs/stash`, so it also appears back in
 * the active repo's own graph once written).
 *
 * Deliberately smaller than the local WIP row's menu ({@link buildWipMenuSpec}): stage/unstage and
 * the AI summary/review both read the *active* repo's working tree today, so offering them here
 * would either silently act on the wrong repo or need a second explicit-path variant of each — left
 * out until there's a concrete need. Committing is not offered for the same reason the local row
 * keeps it off its own menu (inline input only), and there is no inline input on this row at all.
 */
export function buildOtherWorktreeMenuSpec(
  actions: OtherWorktreeMenuActions,
  t: TranslateFn
): MenuSpecEntry[] {
  return [
    menuItem({ text: t('gitTree.otherWorktreeMenu.openWorktree'), action: actions.onOpenWorktree }),
    menuSeparator(),
    menuItem({ text: t('gitTree.otherWorktreeMenu.stash'), action: () => actions.onStash(false) }),
    menuItem({
      text: t('gitTree.otherWorktreeMenu.stashIncludeUntracked'),
      action: () => actions.onStash(true),
    }),
    menuSeparator(),
    menuItem({
      text: t('gitTree.otherWorktreeMenu.revealInFinder'),
      action: actions.onRevealInFinder,
    }),
  ]
}
