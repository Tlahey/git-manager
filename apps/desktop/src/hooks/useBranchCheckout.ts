import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { toast } from '@git-manager/ui'
import { apiCheckoutBranch, apiStashPush, type CheckoutOpts } from '../api/git.api'
import { apiOpenRepo } from '../api/repo.api'
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
    stashAndCheckout,
  }
}
