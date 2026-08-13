import { useCallback } from 'react'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useTerminalStore } from '../stores/terminal.store'
import { goToRepoContent } from '../stores/repoView.store'

/**
 * "Review changes" on a finished terminal session: put the view on the worktree that session is
 * bound to, jump to the graph (the one view the AI side panel can render into), and open the code
 * review of its working tree — the app's existing review feature, aimed at whatever a session (an
 * agent's included) just left behind.
 *
 * Shares `setActiveWorkspacePath`'s "entering the tab's own path clears the workspace" rule with
 * `useFocusTerminalSession`, which this mirrors — the difference is the destination: that one shows
 * the terminal itself, this one shows what changed because of it. Also marks the session seen: the
 * whole point of asking for a review is that the user is now dealing with what finished.
 */
export function useReviewTerminalSessionChanges(): (sessionId: string, cwd: string) => void {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const setAiPanelTarget = useRepoUIStore((s) => s.setAiPanelTarget)
  const markSeen = useTerminalStore((s) => s.markSeen)

  return useCallback(
    (sessionId: string, cwd: string) => {
      setActiveWorkspacePath(cwd === activeRepo ? null : cwd)
      goToRepoContent()
      setAiPanelTarget({ kind: 'reviewWorking' })
      markSeen(sessionId)
    },
    [activeRepo, setActiveWorkspacePath, setAiPanelTarget, markSeen]
  )
}
