import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@git-manager/i18n'
import { toast } from '@git-manager/ui'
import type { GitRef } from '@git-manager/git-types'
import { showNativeMenu } from '../api/nativeMenu.api'
import { buildRefDropMenuSpec } from '../lib/graphContextMenus'
import {
  apiMergeBranch,
  apiFastForwardBranch,
  apiPushBranchTo,
  apiRebaseOntoCommit,
  apiResetToCommit,
} from '../api/git.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { openRebaseWindow } from '../lib/graphWindows'
import { useBranchCheckout } from './useBranchCheckout'

/** Raised when the checkout a rewriting op needs was deferred (stash dialog opened, or the failure
 * was already toasted): the user has been told once, so {@link run} bails out silently. */
class CheckoutDeferredError extends Error {}

/** Human-readable name for a ref — strips the remote prefix (`origin/main` → `main`). */
function displayName(ref: GitRef): string {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) return parts.slice(1).join('/')
  }
  return ref.shortName
}

/** The remote a ref lives on (the first segment of a `remote` ref's short name), else "origin". */
function remoteOf(ref: GitRef): string {
  if (ref.type === 'remote') {
    const parts = ref.shortName.split('/')
    if (parts.length > 1) return parts[0]
  }
  return 'origin'
}

/**
 * Wires the branch/tag drag-and-drop menu in the commit graph. `handleDrop(source, target)` pops
 * the native drop menu (see {@link showRefDropNativeContextMenu}) with the actions relating the
 * dragged `source` ref to the drop `target` ref, each enabled per ref type and wired to the right
 * API — reusing the existing checkout/rebase/reset commands and the PR-create flow, plus the three
 * new merge/fast-forward/push commands.
 */
export function useRefDrop(repoPath: string) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const { checkoutBranchWithStashPrompt } = useBranchCheckout()
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)

  const currentBranch = repo?.head ?? null
  const isDetached = repo?.isDetached ?? false

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
  }

  /** Checks out `branch` unless it's already HEAD — a rewriting op (rebase/reset) acts on HEAD.
   * A refused checkout aborts the whole drop: the stash dialog it opened only resumes the switch,
   * not the rebase/reset that followed, so the user re-runs the drop once the tree is clean. */
  async function ensureCheckedOut(branch: string) {
    if (currentBranch === branch) return
    const ok = await checkoutBranchWithStashPrompt(repoPath, branch, {
      fromRef: currentBranch ?? branch,
      fromDetached: isDetached,
    })
    if (!ok) throw new CheckoutDeferredError(branch)
  }

  /** Runs a git action, refreshing the graph on success and surfacing failures as a toast. */
  async function run(fn: () => Promise<void>, successMsg?: string) {
    try {
      await fn()
      refresh()
      if (successMsg) toast.success(successMsg)
    } catch (err) {
      if (err instanceof CheckoutDeferredError) return
      toast.error(String(err))
    }
  }

  function handleDrop(source: GitRef, target: GitRef) {
    const sourceName = displayName(source)
    const targetName = displayName(target)
    const remote = remoteOf(target)

    const sourceIsBranch = source.type === 'branch'
    const targetIsBranch = target.type === 'branch'
    const params = { source: sourceName, target: targetName, remote }

    void showNativeMenu(
      buildRefDropMenuSpec(
        {
          params,
          targetIsBranch,
          sourceIsBranch,
          // A pull request needs branch heads on both sides — tags can't be a PR head or base.
          prEnabled: source.type !== 'tag' && target.type !== 'tag',
        },
        {
          onFastForward: () =>
            void run(
              () => apiFastForwardBranch(repoPath, source.shortName, target.shortName),
              t('gitTree.dragDrop.fastForwarded', params)
            ),
          onMerge: () =>
            void run(
              () => apiMergeBranch(repoPath, source.shortName, target.shortName),
              t('gitTree.dragDrop.merged', params)
            ),
          onRebase: () =>
            void run(async () => {
              await ensureCheckedOut(source.shortName)
              await apiRebaseOntoCommit(repoPath, target.commitOid)
            }, t('gitTree.dragDrop.rebased', params)),
          onInteractiveRebase: () =>
            void run(async () => {
              await ensureCheckedOut(source.shortName)
              await openRebaseWindow(repoPath, target.commitOid)
            }),
          onPush: () =>
            void run(
              () => apiPushBranchTo(repoPath, source.shortName, targetName, remote),
              t('gitTree.dragDrop.pushed', params)
            ),
          onReset: (mode) =>
            void run(async () => {
              await ensureCheckedOut(source.shortName)
              await apiResetToCommit(repoPath, target.commitOid, mode)
            }, t('gitTree.dragDrop.reset', params)),
          onStartPr: () => openPrCreateWith(sourceName, targetName),
        },
        t
      )
    )
  }

  return { handleDrop }
}
