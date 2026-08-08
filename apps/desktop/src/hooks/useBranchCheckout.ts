import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { toast } from '@git-manager/ui'
import {
  apiCheckoutBranch,
  apiCreateBranch,
  apiGetBranches,
  apiSetBranchUpstream,
  apiStashPush,
  type CheckoutOpts,
} from '../api/git.api'
import { apiGetRepoSummary, apiOpenRepo } from '../api/repo.api'
import { runActivity } from '../lib/activityCorrelation'
import { localBranchNameForRemote } from '../lib/branchUpstream'
import { useRepoDataStore } from '../stores/repoData.store'
import { useStashDialogStore } from '../stores/stashDialog.store'

/** Message tagged on the stash created to unblock a checkout, so it's identifiable in the list
 * (mirrors `BISECT_STASH_MESSAGE` in useBisectActions.ts — a git-side tag, not UI copy). */
const CHECKOUT_STASH_MESSAGE = 'git-manager: checkout autostash'

/**
 * libgit2 refuses a safe checkout that would clobber uncommitted work with a "N conflicts prevent
 * checkout" error — the only failure stashing can actually resolve. Every other failure (unknown
 * branch, IO error, locked index) is reported as-is rather than mislabelled as a dirty worktree.
 */
function isBlockedByLocalChanges(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err)
  return /prevents? checkout|would be overwritten|local changes/i.test(raw)
}

/**
 * Single entry point for switching branches/commits: refreshes the repo cache and the dependent
 * queries on success, and — when the switch is blocked by uncommitted changes — hands over to the
 * shared stash dialog (see stashDialog.store.ts) instead of failing with a raw error.
 */
export function useBranchCheckout() {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const openStashDialog = useStashDialogStore((s) => s.openCheckoutDialog)
  const closeStashDialog = useStashDialogStore((s) => s.closeDialog)
  const [pending, setPending] = useState(false)

  const refresh = useCallback(
    async (repoPath: string) => {
      try {
        const fresh = await apiOpenRepo(repoPath)
        useRepoDataStore.getState().setRepoCache(repoPath, fresh)
      } catch {
        /* the queries below still refresh the views even if the cache update failed */
      }
      queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    },
    [queryClient]
  )

  /** Checks out `targetRef`; on a dirty-worktree refusal, opens the stash dialog and returns false
   * (the caller should treat that as "not switched yet" — the dialog resumes the flow).
   * Stable identity: it is wired into memoized graph context menus. */
  const checkoutBranchWithStashPrompt = useCallback(
    async (repoPath: string, targetRef: string, opts?: CheckoutOpts): Promise<boolean> => {
      setPending(true)
      try {
        await apiCheckoutBranch(repoPath, targetRef, opts)
        await refresh(repoPath)
        return true
      } catch (err) {
        if (isBlockedByLocalChanges(err)) openStashDialog(repoPath, targetRef, opts)
        else toast.error(String(err))
        return false
      } finally {
        setPending(false)
      }
    },
    [refresh, openStashDialog]
  )

  /**
   * Switches to a remote-tracking branch (`origin/feat`) the way `git switch feat` does: onto the
   * LOCAL branch of that name, creating it — tracking the remote — when it doesn't exist yet.
   *
   * Checking out `refs/remotes/origin/feat` itself is what git calls a detached HEAD: the app used
   * to do exactly that (it checked out the remote branch's commit OID), so the ref badge read
   * "HEAD", committing on top left the work on no branch at all, and pushing had nothing to push
   * to. There is no gesture in the app for which that is the intent — a user clicking a remote
   * branch wants to work on it — so the detached form is not offered here at all; a commit-scoped
   * "Checkout commit" is still how one deliberately detaches.
   *
   * An existing local branch of that name is checked out as it stands, never moved onto the remote
   * tip: it may hold unpushed work, and `git switch` doesn't move it either. Its ahead/behind
   * counters then say what pulling would do.
   *
   * The whole gesture is one correlated action, which is what makes ⌘Z take back the checkout *and*
   * the branch it just created — see `apiCreateAndCheckoutBranch`'s doc comment for what happens
   * when those two are recorded apart (git refuses to delete the branch HEAD points at).
   */
  const checkoutRemoteBranchAsLocal = useCallback(
    async (repoPath: string, remoteRef: string): Promise<boolean> => {
      const localName = localBranchNameForRemote(remoteRef)
      if (!localName) {
        toast.error(t('checkout.remote.invalidRef', { ref: remoteRef }))
        return false
      }

      return runActivity('git.checkout', async () => {
        let created = false
        let opts: CheckoutOpts
        setPending(true)
        try {
          // Where HEAD is, read *before* anything is created and by this hook rather than by each
          // caller — without it `apiCheckoutBranch` records no undo entry, so the branch creation
          // below would be the only half of the gesture ⌘Z can reach, and undoing it alone means
          // asking git to delete the branch that is now HEAD, which it refuses.
          const summary = await apiGetRepoSummary(repoPath)
          opts = { fromRef: summary.head, fromDetached: summary.isDetached }

          const locals = await apiGetBranches(repoPath, false)
          created = !locals.some((b) => b.name === localName)
          if (created) {
            await apiCreateBranch(repoPath, localName, remoteRef)
            await apiSetBranchUpstream(repoPath, localName, remoteRef)
          }
        } catch (err) {
          toast.error(String(err))
          return false
        } finally {
          setPending(false)
        }

        const ok = await checkoutBranchWithStashPrompt(repoPath, localName, opts)
        if (ok && created) {
          toast.success(
            t('checkout.remote.trackingBranchCreated', {
              branch: localName,
              upstream: remoteRef,
            })
          )
        }
        return ok
      })
    },
    [checkoutBranchWithStashPrompt, t]
  )

  /** Stashes everything (untracked included) then retries the checkout — the stash dialog's
   * confirm action. */
  const stashAndCheckout = useCallback(
    async (repoPath: string, targetRef: string, opts?: CheckoutOpts): Promise<boolean> => {
      setPending(true)
      try {
        await apiStashPush(repoPath, `${CHECKOUT_STASH_MESSAGE} (${targetRef})`, true)
        await apiCheckoutBranch(repoPath, targetRef, opts)
        await refresh(repoPath)
        closeStashDialog()
        toast.success(t('checkout.conflict.successStashAndCheckout', { branch: targetRef }))
        return true
      } catch (err) {
        toast.error(String(err))
        return false
      } finally {
        setPending(false)
      }
    },
    [refresh, closeStashDialog, t]
  )

  return {
    pending,
    checkoutBranchWithStashPrompt,
    checkoutRemoteBranchAsLocal,
    stashAndCheckout,
  }
}
