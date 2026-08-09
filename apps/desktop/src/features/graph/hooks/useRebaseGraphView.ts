import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGetRebaseState } from '../../../api/git.api'
import { useRebaseViewStore } from '../../../stores/rebaseView.store'
import type { ConflictRowInfo } from './useGitGraphNodes'

/**
 * The graph's view of an in-progress rebase: the polled rebase state, the synthetic CONFLICT
 * row's info, and whether the rebase-progress center panel should be showing.
 *
 * Extracted from GitGraph.tsx (2026-08 retrofit, see architecture-guardian skill's R3). The
 * commit-selection-dependent bits (whether the conflicted-files panel is open for the *currently
 * selected* row) stay in GitGraph.tsx itself — `primaryNode` is derived later in that component's
 * render, from state (`useGitGraphNodes`'s `conflictNode`) that itself depends on this hook's
 * `conflictInfo`, so folding them in here would need calling this hook twice for no benefit.
 */
export function useRebaseGraphView(repoPath: string) {
  // ── Rebase state (for the synthetic conflict row in the graph) ─────────────
  const { data: rebaseState } = useQuery({
    queryKey: ['rebase-state', repoPath],
    queryFn: () => apiGetRebaseState(repoPath),
    enabled: !!repoPath,
    refetchInterval: 4000,
  })
  const isRebasePaused = rebaseState?.kind === 'conflict' || rebaseState?.kind === 'edit_pause'
  const conflictInfo: ConflictRowInfo | null = isRebasePaused
    ? {
        count: rebaseState?.conflictedFiles?.length ?? 0,
        branchName: rebaseState?.branchName,
        currentStep: rebaseState?.currentStep,
        totalSteps: rebaseState?.totalSteps,
      }
    : null

  // ── Rebase progress view (center panel) ────────────────────────────────────
  // Any running rebase — not just a paused one — takes the center over with its step rail, so the
  // user can see where they are in the plan. Dismissing it hands the center back to the graph,
  // where the CONFLICT row banners the rebase and clicking it comes back here. `isRebasing` is
  // listed positively rather than as `!== 'idle'`: `kind` crosses IPC as a string, and an
  // unrecognized value must not hand the center panel to a view with nothing to show.
  const isRebasing = isRebasePaused || rebaseState?.kind === 'in_progress'
  const rebaseProgressHidden = useRebaseViewStore((s) => s.views[repoPath]?.progressHidden ?? false)
  const rebaseFilesHidden = useRebaseViewStore((s) => s.views[repoPath]?.filesHidden ?? false)
  const resetRebaseView = useRebaseViewStore((s) => s.reset)
  const showRebaseProgress = useRebaseViewStore((s) => s.showProgress)
  const showRebaseFiles = useRebaseViewStore((s) => s.showFiles)
  const hideRebaseFiles = useRebaseViewStore((s) => s.hideFiles)
  const toggleRebaseFiles = useRebaseViewStore((s) => s.toggleFiles)
  const rebaseViewOpen = isRebasing && !rebaseProgressHidden
  // A dismissal only applies to the rebase that was on screen: once the repo stops rebasing,
  // forget it so the next one surfaces the view again. Gated on the state having actually loaded —
  // while the query is still in flight there's no rebase *yet*, and clearing on that would
  // resurrect the view on every remount (tab switch, worktree switch…).
  useEffect(() => {
    if (rebaseState && !isRebasing) resetRebaseView(repoPath)
  }, [rebaseState, isRebasing, repoPath, resetRebaseView])

  return {
    rebaseState,
    isRebasePaused,
    conflictInfo,
    isRebasing,
    rebaseViewOpen,
    rebaseFilesHidden,
    showRebaseProgress,
    showRebaseFiles,
    hideRebaseFiles,
    toggleRebaseFiles,
  }
}
