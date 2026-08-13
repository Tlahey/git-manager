import { useCallback } from 'react'
import { useRepoUIStore } from '../stores/repoUI.store'
import { goToRepoContent } from '../stores/repoView.store'

/**
 * Opens the PR-create view for a branch from outside the graph — the board's "Create PR" action,
 * for a card whose work is done.
 *
 * Shares the "enter the worktree, then jump to the graph" shape with `useFocusTerminalSession` and
 * `useReviewTerminalSessionChanges`: `worktreePath`, when given, points the tab at the worktree the
 * branch was worked in (same "the tab's own path clears the workspace" rule), before `openPrCreateWith`
 * takes the center panel. Only the head branch is named — the base is left for `PrCreateCenter` to
 * resolve to the repository's real GitHub default, which is what a card's branch should target.
 */
export function useOpenPrCreateForBranch(): (branch: string, worktreePath?: string) => void {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)

  return useCallback(
    (branch: string, worktreePath?: string) => {
      if (worktreePath) setActiveWorkspacePath(worktreePath === activeRepo ? null : worktreePath)
      goToRepoContent()
      openPrCreateWith(branch)
    },
    [activeRepo, setActiveWorkspacePath, openPrCreateWith]
  )
}
