import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { open } from '@tauri-apps/plugin-dialog'
import { toast } from '@git-manager/ui'
import type { GitRef } from '@git-manager/git-types'
import { showNativeMenu } from '../api/nativeMenu.api'
import { buildTagMenuSpec } from '../lib/graphContextMenus'
import {
  apiCheckoutBranch,
  apiCherryPickCommit,
  apiMergeBranch,
  apiRebaseOntoCommit,
  apiDeleteTag,
  apiGetTagWebUrl,
} from '../api/git.api'
import { apiAddWorktree } from '../api/worktree.api'
import { openRebaseWindow } from '../lib/graphWindows'
import type { GraphCommitAction } from '../stores/repoUI.store'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/** A tag-specific dialog awaiting confirmation/input, or `null` for "no dialog open". */
export type PendingTagAction =
  | { kind: 'annotate'; tagName: string; oid: string; shortOid: string }
  | { kind: 'deleteRemote'; tagName: string; oid: string; remote: string }
  | null

interface UseTagContextMenuParams {
  repoPath: string
  /** Current HEAD branch name, or `null` when detached — gates the relationship actions. */
  currentBranch: string | null
  isDetached: boolean
  /** Selects the tag's commit row so the reused commit dialogs (branch/reset/revert) target it. */
  selectCommit: (oid: string) => void
  /** Opens a commit-scoped dialog (branch/reset/revert) against the currently selected commit. */
  setPendingCommitAction: (action: GraphCommitAction) => void
  t: TranslateFn
}

/**
 * Encapsulates the tag badge's native context menu: it reuses the existing commit actions (keyed on
 * the tag's commit), the branch-relationship actions (merge/rebase relative to the current branch),
 * and the tag-specific ones (delete local/remote, copy name/link, annotate). Commit dialogs are
 * routed through the graph's own `pendingAction`; the two tag-only dialogs (annotate, remote delete)
 * are driven by the `pendingTagAction` state returned here.
 */
export function useTagContextMenu({
  repoPath,
  currentBranch,
  isDetached,
  selectCommit,
  setPendingCommitAction,
  t,
}: UseTagContextMenuParams) {
  const queryClient = useQueryClient()
  const [pendingTagAction, setPendingTagAction] = useState<PendingTagAction>(null)

  // Stable identity: this handler is published through TagMenuContext to every memoized GraphRow, so
  // a fresh identity on each render would re-render all visible rows. Its deps are all stable.
  const openTagMenu = useCallback(
    (e: React.MouseEvent, gitRef: GitRef) => {
      e.preventDefault()
      e.stopPropagation()

      function refresh() {
        queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
        queryClient.invalidateQueries({ queryKey: ['tags', repoPath] })
      }

      /** Runs a git action, refreshing the graph on success and surfacing failures as a toast. */
      async function run(fn: () => Promise<unknown>, successMsg?: string) {
        try {
          await fn()
          refresh()
          if (successMsg) toast.success(successMsg)
        } catch (err) {
          toast.error(String(err))
        }
      }

      async function handleCreateWorktree(oid: string) {
        try {
          const destPath = await open({ directory: true, multiple: false })
          if (!destPath || typeof destPath !== 'string') return
          await apiAddWorktree(repoPath, oid, destPath)
          toast.success(t('gitTree.contextMenu.worktreeCreated'))
        } catch (err) {
          toast.error(String(err))
        }
      }

      async function handleCopyName(name: string) {
        await navigator.clipboard.writeText(name)
        toast.success(t('gitTree.tagMenu.nameCopied'))
      }

      async function handleCopyLink(name: string) {
        try {
          const url = await apiGetTagWebUrl(repoPath, name)
          if (!url) {
            toast.error(t('gitTree.contextMenu.noRemoteLink'))
            return
          }
          await navigator.clipboard.writeText(url)
          toast.success(t('gitTree.contextMenu.linkCopied'))
        } catch (err) {
          toast.error(String(err))
        }
      }

      // Select the tag's commit up front so the reused commit dialogs (branch/reset/revert), which act
      // on the graph's selected commit, target the right one when their menu item fires later.
      selectCommit(gitRef.commitOid)

      const relationEnabled = !!currentBranch && !isDetached
      const params = { tag: gitRef.shortName, branch: currentBranch ?? '', remote: 'origin' }

      void showNativeMenu(
        buildTagMenuSpec(
          { params, relationEnabled },
          {
            onMerge: () =>
              void run(
                () => apiMergeBranch(repoPath, gitRef.shortName, currentBranch as string),
                t('gitTree.tagMenu.merged', params)
              ),
            onRebase: () =>
              void run(
                () => apiRebaseOntoCommit(repoPath, gitRef.commitOid),
                t('gitTree.tagMenu.rebased', params)
              ),
            onInteractiveRebase: () =>
              void openRebaseWindow(repoPath, gitRef.commitOid).catch(console.error),
            onCheckout: () => void run(() => apiCheckoutBranch(repoPath, gitRef.commitOid)),
            onCreateWorktree: () => void handleCreateWorktree(gitRef.commitOid),
            onCreateBranch: () => setPendingCommitAction({ kind: 'branch' }),
            onCherryPick: () =>
              void run(
                () => apiCherryPickCommit(repoPath, gitRef.commitOid),
                t('gitTree.contextMenu.cherryPicked')
              ),
            onReset: (mode) => setPendingCommitAction({ kind: 'reset', mode }),
            onRevert: () => setPendingCommitAction({ kind: 'revert' }),
            onDeleteLocal: () =>
              void run(
                () => apiDeleteTag(repoPath, gitRef.shortName, { targetOid: gitRef.commitOid }),
                t('gitTree.tagMenu.deletedLocal', params)
              ),
            onDeleteRemote: () =>
              setPendingTagAction({
                kind: 'deleteRemote',
                tagName: gitRef.shortName,
                oid: gitRef.commitOid,
                remote: 'origin',
              }),
            onCopyName: () => void handleCopyName(gitRef.shortName),
            onCopyLink: () => void handleCopyLink(gitRef.shortName),
            onAnnotate: () =>
              setPendingTagAction({
                kind: 'annotate',
                tagName: gitRef.shortName,
                oid: gitRef.commitOid,
                shortOid: gitRef.commitOid.slice(0, 7),
              }),
          },
          t
        )
      )
    },
    [repoPath, currentBranch, isDetached, selectCommit, setPendingCommitAction, t, queryClient]
  )

  return { openTagMenu, pendingTagAction, setPendingTagAction }
}
