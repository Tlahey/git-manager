import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@git-manager/ui'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'
import {
  apiCreateCommit,
  apiStageAll,
  apiCopyCommitSha,
  apiCherryPickCommit,
  apiGetCommitWebUrl,
  apiCreatePatch,
} from '../../../api/git.api'
import { apiAddWorktree } from '../../../api/worktree.api'
import { shortOid } from '../../../lib/shortOid'
import { pickSaveDestination } from '../../../lib/pickSaveDestination'
import { pickFolder } from '../../../lib/pickFolder'
import { refreshLogAndStatus } from '../lib/graphQueryRefresh'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

interface UseCommitRowActionsParams {
  repoPath: string
  /** The loaded page, read only to look a commit's metadata up by oid. */
  nodes: GitGraphNode[]
  status: GitStatus | undefined
  /** Shared with the branch menu, so one instance of `useBranchCheckout` serves both. */
  checkoutBranchWithStashPrompt: (repoPath: string, targetRef: string) => Promise<boolean>
  t: TranslateFn
}

/**
 * The imperative actions a *single commit* offers, independent of which menu raised them.
 *
 * Every one of these has the same shape — call one git command, refresh, report — and none of them
 * needs to know anything about the menu, the selection, or the dialogs. Extracted from
 * `useGitGraphActions` on that boundary: what is left there is the menu *assembly*, which is where
 * the rules actually live, while these are the effects the rules point at.
 *
 * Two of them are reachable from more than one place, which is the reason this is a hook and not a
 * set of closures: `createWorktree` is also the branch menu's "open worktree from here", and
 * `openFixupWindow` is also the command palette's `fixup` bridge.
 */
export function useCommitRowActions({
  repoPath,
  nodes,
  status,
  checkoutBranchWithStashPrompt,
  t,
}: UseCommitRowActionsParams) {
  const queryClient = useQueryClient()
  const refresh = () => refreshLogAndStatus(queryClient, repoPath)

  async function copySha(oid: string) {
    await apiCopyCommitSha(oid)
    toast.success(t('gitTree.contextMenu.shaCopied'))
  }

  /** Opens the dedicated "Commit Changes" fixup window (same pattern as the merge window).
   *  Memoized: `useGitGraphActions`'s `pendingGraphAction` bridge effect depends on it, and it must
   *  not re-run on every render just because this function was recreated. */
  const openFixupWindow = useCallback(
    async (oid: string) => {
      const node = nodes.find((n) => n.commit.oid === oid)
      if (!node) return
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
      const safeLabel = `fixup-${repoPath.replace(/[^a-zA-Z0-9_-]/g, '-')}-${node.commit.shortOid}`
      const url =
        `/?window=fixup&repoPath=${encodeURIComponent(repoPath)}` +
        `&oid=${encodeURIComponent(oid)}` +
        `&shortOid=${encodeURIComponent(node.commit.shortOid)}` +
        `&subject=${encodeURIComponent(node.commit.subject)}`

      const existing = await WebviewWindow.getByLabel(safeLabel)
      if (existing) {
        await existing.show()
        await existing.setFocus()
      } else {
        new WebviewWindow(safeLabel, {
          url,
          title: `Commit Changes - fixup! ${node.commit.subject}`,
          width: 1200,
          height: 850,
          minWidth: 900,
          minHeight: 600,
          decorations: true,
        })
      }
    },
    [repoPath, nodes]
  )

  /** Detaches HEAD onto `oid`. The hook refreshes the graph queries itself on success, and falls
   * back to the stash prompt when uncommitted changes block the checkout. */
  async function checkoutDetached(oid: string) {
    await checkoutBranchWithStashPrompt(repoPath, oid)
  }

  async function createWorktree(oid: string) {
    try {
      const destPath = await pickFolder()
      if (!destPath) return
      await apiAddWorktree(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.worktreeCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function cherryPick(oid: string) {
    try {
      await apiCherryPickCommit(repoPath, oid)
      refresh()
      toast.success(t('gitTree.contextMenu.cherryPicked'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function copyWebLink(oid: string) {
    try {
      const url = await apiGetCommitWebUrl(repoPath, oid)
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

  async function createPatch(oid: string) {
    try {
      const destPath = await pickSaveDestination(`${shortOid(oid)}.patch`)
      if (!destPath) return
      await apiCreatePatch(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.patchCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  /** Commits the WIP row's message. Stages everything first when nothing is staged, so the button
   * means "commit my work" rather than "commit nothing". */
  async function commitWip(message: string) {
    if (!message.trim()) return
    try {
      const stagedCount = status?.staged?.length || 0
      if (stagedCount === 0) {
        await apiStageAll(repoPath)
      }
      await apiCreateCommit(repoPath, message)
      refresh()
    } catch (err) {
      toast.error(String(err))
    }
  }

  return {
    copySha,
    openFixupWindow,
    checkoutDetached,
    createWorktree,
    cherryPick,
    copyWebLink,
    createPatch,
    commitWip,
  }
}
