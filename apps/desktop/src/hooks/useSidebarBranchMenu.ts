import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { open, save } from '@tauri-apps/plugin-dialog'
import { toast } from '@git-manager/ui'
import { useTranslation } from '@git-manager/i18n'
import type { GitBranch, GitRef } from '@git-manager/git-types'
import { showNativeMenu } from '../api/nativeMenu.api'
import { buildBranchMenuSpec, type BranchMenuActions } from '../lib/graphContextMenus'
import {
  apiPullBranch,
  apiPushBranch,
  apiFastForwardBranch,
  apiMergeBranch,
  apiRebaseOntoCommit,
  apiCheckoutBranch,
  apiDeleteBranch,
  apiCopyCommitSha,
  apiGetCommitWebUrl,
  apiGetBranchWebUrl,
  apiCreatePatch,
} from '../api/git.api'
import { apiAddWorktree } from '../api/worktree.api'
import { useRepoDataStore } from '../stores/repoData.store'
import { useRepoUIStore } from '../stores/repoUI.store'
import { usePinnedBranchesStore } from '../stores/pinned-branches.store'
import { useSoloModeStore } from '../stores/soloMode.store'

/** A `GitBranch` rendered as the `GitRef` the shared menu builder expects (pointing at its tip). */
function branchToRef(branch: GitBranch): GitRef {
  return {
    name: branch.name,
    shortName: branch.shortName,
    type: branch.isRemote ? 'remote' : 'branch',
    commitOid: branch.commitOid,
  }
}

/**
 * The repository sidebar's branch context menu. Reuses the SAME configuration as the commit
 * graph's per-branch menu (`buildBranchMenuSpec`) so the two stay in sync — the only sidebar
 * specifics are that it always offers "Checkout" (a sidebar branch isn't tied to a clicked commit)
 * and that Rename opens its own dialog (rendered by the caller from `renameTarget`).
 */
export function useSidebarBranchMenu(repoPath: string) {
  const { t } = useTranslation('git')
  const queryClient = useQueryClient()
  const repo = useRepoDataStore((s) => s.repoCache[repoPath])
  const openPrCreateWith = useRepoUIStore((s) => s.openPrCreateWith)
  const setPin = usePinnedBranchesStore((s) => s.setPin)
  const enableSolo = useSoloModeStore((s) => s.enable)
  // The branch whose rename dialog is open, or null. The caller renders `<RenameBranchDialog>`.
  const [renameTarget, setRenameTarget] = useState<string | null>(null)

  const currentBranch = repo?.head ?? null
  const isDetached = repo?.isDetached ?? false

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['branches', repoPath] })
  }

  async function run(fn: () => Promise<unknown>, successMsg?: string) {
    try {
      await fn()
      refresh()
      if (successMsg) toast.success(successMsg)
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function copyBranchLink(ref: GitRef) {
    try {
      const name =
        ref.type === 'remote' ? ref.shortName.split('/').slice(1).join('/') : ref.shortName
      const url = await apiGetBranchWebUrl(repoPath, name)
      if (!url) return toast.error(t('gitTree.contextMenu.noRemoteLink'))
      await navigator.clipboard.writeText(url)
      toast.success(t('gitTree.contextMenu.linkCopied'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function copyCommitLink(oid: string) {
    try {
      const url = await apiGetCommitWebUrl(repoPath, oid)
      if (!url) return toast.error(t('gitTree.contextMenu.noRemoteLink'))
      await navigator.clipboard.writeText(url)
      toast.success(t('gitTree.contextMenu.linkCopied'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function createWorktreeFrom(oid: string) {
    try {
      const destPath = await open({ directory: true, multiple: false })
      if (!destPath || typeof destPath !== 'string') return
      await apiAddWorktree(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.worktreeCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function createPatch(oid: string) {
    try {
      const destPath = await save({ defaultPath: `${oid.slice(0, 7)}.patch` })
      if (!destPath) return
      await apiCreatePatch(repoPath, oid, destPath)
      toast.success(t('gitTree.contextMenu.patchCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  function openBranchMenu(e: React.MouseEvent, branch: GitBranch) {
    e.preventDefault()
    const ref = branchToRef(branch)
    const rel = (r: GitRef) => ({ branch: r.shortName, current: currentBranch ?? '' })

    const branchActions: BranchMenuActions = {
      onPull: () => void run(() => apiPullBranch(repoPath), t('gitTree.branchMenu.pulled', rel(ref))),
      onPush: () => void run(() => apiPushBranch(repoPath), t('gitTree.branchMenu.pushed', rel(ref))),
      onFastForward: (r) =>
        void run(
          () => apiFastForwardBranch(repoPath, r.shortName, currentBranch as string),
          t('gitTree.branchMenu.fastForwarded', rel(r))
        ),
      onMergeInto: (r) =>
        void run(
          () => apiMergeBranch(repoPath, r.shortName, currentBranch as string),
          t('gitTree.branchMenu.merged', rel(r))
        ),
      onRebaseOntoBranch: (r) =>
        void run(() => apiRebaseOntoCommit(repoPath, r.commitOid), t('gitTree.branchMenu.rebased', rel(r))),
      onCheckoutBranch: (r) =>
        void run(() =>
          apiCheckoutBranch(repoPath, r.type === 'branch' ? r.shortName : r.commitOid)
        ),
      onOpenWorktreeFrom: (r) => void createWorktreeFrom(r.commitOid),
      onStartPr: (r) => {
        const base = r.type === 'remote' ? r.shortName.split('/').slice(1).join('/') : r.shortName
        openPrCreateWith(currentBranch ?? '', base)
      },
      onRenameBranch: (r) => setRenameTarget(r.shortName),
      onDeleteBranch: (r) =>
        void run(
          () => apiDeleteBranch(repoPath, r.shortName, { targetOid: r.commitOid, upstream: branch.upstream }),
          t('gitTree.branchMenu.deleted', rel(r))
        ),
      onCopyBranchName: (r) =>
        void navigator.clipboard
          .writeText(r.shortName)
          .then(() => toast.success(t('gitTree.branchMenu.nameCopied'))),
      onCopyBranchLink: (r) => void copyBranchLink(r),
      onPinToLeft: (r) => {
        setPin(repoPath, r.shortName, true)
        toast.success(t('gitTree.branchMenu.pinned', rel(r)))
      },
      onSolo: (r) => enableSolo([r.shortName]),
    }

    const copyActions = {
      onCopySha: () =>
        void apiCopyCommitSha(branch.commitOid).then(() =>
          toast.success(t('gitTree.contextMenu.shaCopied'))
        ),
      onCopyLink: () => void copyCommitLink(branch.commitOid),
      onCreatePatch: () => void createPatch(branch.commitOid),
    }

    void showNativeMenu(
      buildBranchMenuSpec(
        ref,
        { isSingle: true, targetCount: 1, isMergeCommit: false, refs: [ref], currentBranch, isDetached, currentBranchRef: null },
        branchActions,
        copyActions,
        t
      )
    ).catch(console.error)
  }

  return { openBranchMenu, renameTarget, setRenameTarget }
}
