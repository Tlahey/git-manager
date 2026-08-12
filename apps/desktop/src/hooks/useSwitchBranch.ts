import { useCallback } from 'react'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { useBranchCheckout } from './useBranchCheckout'
import { useOpenRepoTab } from './useOpenRepoTab'
import { apiGetRepoSummary } from '../api/repo.api'

/**
 * Switching onto a local branch — the gesture behind every branch picker in the app (the toolbar's
 * `BranchContext`, the sidebar's branch rows and their context menu, ⌘K's "checkout" verb).
 *
 * **It always targets the base project**, never whichever linked worktree is on screen. A branch
 * lives in exactly one worktree, so the ones a picker offers as branches are precisely those no
 * worktree holds — and the only place those can be checked out is the repository that owns them.
 * Aiming at the viewed path instead was wrong twice over: it moved a linked worktree's HEAD instead
 * of the project's, and, since `services/git_branch.rs::checkout_branch` is a `git2`
 * `checkout_tree` + `set_head` rather than the `git` CLI, a branch the base project already had
 * checked out ended up checked out *twice* rather than being refused. (That backstop now exists —
 * `AppError::BranchCheckedOutElsewhere` — but it is a backstop: this hook is what keeps the app
 * from ever asking.)
 *
 * Bringing the view back to the base project is part of the same gesture, not a courtesy: a tab
 * left on a worktree after the switch would be showing a HEAD that nobody moved.
 *
 * Deliberately narrower than {@link useBranchCheckout}, which it wraps and does not replace:
 * checking out a *commit* (a tag's tip, an undo restoring a detached HEAD) is a per-worktree act
 * and must keep targeting the path its caller names. Only named local branches come through here.
 */
export function useSwitchBranch() {
  const activeRepo = useRepoUIStore((s) => s.activeRepo)
  const setActiveWorkspacePath = useRepoUIStore((s) => s.setActiveWorkspacePath)
  const repoCache = useRepoDataStore((s) => s.repoCache)
  const { checkoutBranchWithStashPrompt, checkoutRemoteBranchAsLocal } = useBranchCheckout()
  const openRepoTab = useOpenRepoTab()

  // The repository that owns whatever the tab shows: its own path for a normal repo, the owning
  // repo's main worktree when the tab was opened *on* a linked worktree (the sidebar's "Open in new
  // tab"). Falls back to the tab's path while the repo cache is still empty — "we can't tell yet,
  // so don't reroute", the same default `lib/linkedWorktree.ts` takes.
  const basePath = activeRepo ? (repoCache[activeRepo]?.mainWorktreePath ?? activeRepo) : null

  /** Puts the view back on the base project once a switch has landed there. */
  const revealBase = useCallback(() => {
    setActiveWorkspacePath(null)
    if (basePath && basePath !== activeRepo) openRepoTab(basePath)
  }, [basePath, activeRepo, setActiveWorkspacePath, openRepoTab])

  /** Switches the base project onto local branch `shortName`. */
  const switchBranch = useCallback(
    async (shortName: string): Promise<boolean> => {
      if (!basePath) return false
      // Where the base project's HEAD is, read fresh rather than taken from the tab's cached repo:
      // on a linked-worktree tab that snapshot names the worktree's branch, and ⌘Z would restore
      // the wrong one. A failed read only costs the undo entry its starting point, so it never
      // blocks the switch — `checkoutBranchWithStashPrompt` owns the user-facing failure.
      const summary = await apiGetRepoSummary(basePath).catch(() => null)
      const ok = await checkoutBranchWithStashPrompt(
        basePath,
        shortName,
        summary ? { fromRef: summary.head, fromDetached: summary.isDetached } : undefined
      )
      if (ok) revealBase()
      return ok
    },
    [basePath, checkoutBranchWithStashPrompt, revealBase]
  )

  /**
   * Switches the base project onto the *local* branch of a remote-tracking ref, creating it as a
   * tracking branch when it doesn't exist — `git switch feat`, never the detached
   * `git checkout origin/feat`. Reads the base project's HEAD itself, which is why this one passes
   * no options (see `checkoutRemoteBranchAsLocal`).
   */
  const switchRemoteBranch = useCallback(
    async (remoteRef: string): Promise<boolean> => {
      if (!basePath) return false
      const ok = await checkoutRemoteBranchAsLocal(basePath, remoteRef)
      if (ok) revealBase()
      return ok
    },
    [basePath, checkoutRemoteBranchAsLocal, revealBase]
  )

  return { switchBranch, switchRemoteBranch, basePath }
}
