import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import { open, save } from '@tauri-apps/plugin-dialog'
import { toast } from '@git-manager/ui'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'
import { showCommitNativeContextMenu, showStashNativeContextMenu } from '../api/nativeMenu.api'
import {
  apiStashApply,
  apiStashPop,
  apiStashDrop,
  apiCreateCommit,
  apiStageAll,
  apiCopyCommitSha,
  apiCheckoutBranch,
  apiCherryPickCommit,
  apiRebaseOntoCommit,
  apiGetCommitWebUrl,
  apiCreatePatch,
  apiIsCommitOnCurrentBranch,
} from '../api/git.api'
import { apiAddWorktree } from '../api/worktree.api'
import { useRepoUIStore } from '../stores/repoUI.store'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

interface UseGitGraphActionsParams {
  repoPath: string
  nodes: GitGraphNode[]
  selected: Set<string>
  primaryOid: string | null
  setPrimaryOid: (oid: string) => void
  selectSingle: (oid: string) => void
  hiddenStashes: string[]
  toggleStashVisibility: (repoPath: string, oid: string) => void
  status: GitStatus | undefined
  isRebasePaused: boolean
  t: TranslateFn
}

export type PendingAction =
  | { kind: 'reset'; mode: 'soft' | 'mixed' | 'hard'; targetOid?: string; targetSubject?: string }
  | { kind: 'revert' }
  | { kind: 'branch' }
  | { kind: 'tag'; annotated: boolean }
  | { kind: 'compare' }
  | null

/**
 * Encapsule les actions impératives déclenchées depuis le graphe : menu
 * contextuel natif (commit/stash), copie de SHA, fixup, et commit WIP.
 */
export function useGitGraphActions({
  repoPath,
  nodes,
  selected,
  primaryOid,
  setPrimaryOid,
  selectSingle,
  hiddenStashes,
  toggleStashVisibility,
  status,
  isRebasePaused,
  t,
}: UseGitGraphActionsParams) {
  const queryClient = useQueryClient()
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)

  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  function refreshLogAndStatus() {
    queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
  }

  async function handleCopySha() {
    if (!primaryOid) return
    await apiCopyCommitSha(primaryOid)
    toast.success(t('gitTree.contextMenu.shaCopied'))
  }

  /** Opens the dedicated "Commit Changes" fixup window (same pattern as the merge window). */
  async function openFixupWindow(oid: string) {
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
  }

  async function handleCheckoutDetached() {
    if (!primaryOid) return
    try {
      await apiCheckoutBranch(repoPath, primaryOid)
      refreshLogAndStatus()
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCreateWorktree() {
    if (!primaryOid) return
    try {
      const destPath = await open({ directory: true, multiple: false })
      if (!destPath || typeof destPath !== 'string') return
      await apiAddWorktree(repoPath, primaryOid, destPath)
      toast.success(t('gitTree.contextMenu.worktreeCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCherryPick() {
    if (!primaryOid) return
    try {
      await apiCherryPickCommit(repoPath, primaryOid)
      refreshLogAndStatus()
      toast.success(t('gitTree.contextMenu.cherryPicked'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleRebaseOntoCommit() {
    if (!primaryOid) return
    try {
      await apiRebaseOntoCommit(repoPath, primaryOid)
      refreshLogAndStatus()
      toast.success(t('gitTree.contextMenu.rebased'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCopyWebLink() {
    if (!primaryOid) return
    try {
      const url = await apiGetCommitWebUrl(repoPath, primaryOid)
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

  async function handleCreatePatch() {
    if (!primaryOid) return
    try {
      const destPath = await save({ defaultPath: `${primaryOid.slice(0, 7)}.patch` })
      if (!destPath) return
      await apiCreatePatch(repoPath, primaryOid, destPath)
      toast.success(t('gitTree.contextMenu.patchCreated'))
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function handleCommitWip(message: string) {
    if (!message.trim()) return
    try {
      const stagedCount = status?.staged?.length || 0
      if (stagedCount === 0) {
        await apiStageAll(repoPath)
      }
      await apiCreateCommit(repoPath, message)
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
    } catch (err) {
      toast.error(String(err))
    }
  }

  async function openMenuAt(e: React.MouseEvent, oid: string) {
    if (oid === 'WIP') return
    e.preventDefault()
    e.stopPropagation()

    // Check if this is a stash commit
    const clickedNode = nodes.find((n) => n.commit.oid === oid)
    const stashRef = clickedNode?.refs.find((r) => r.type === 'stash')

    if (stashRef) {
      const stashMatch = stashRef.shortName.match(/stash@\{(\d+)\}/)
      const index = stashMatch ? parseInt(stashMatch[1], 10) : 0

      selectSingle(oid)

      const isHidden = hiddenStashes.includes(oid)
      showStashNativeContextMenu({
        isHidden,
        onApply: async () => {
          try {
            await apiStashApply(repoPath, index)
            mutate(['git-stashes', repoPath])
            queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
            queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          } catch (err) {
            toast.error(String(err))
          }
        },
        onPop: async () => {
          try {
            await apiStashPop(repoPath, index)
            mutate(['git-stashes', repoPath])
            queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
            queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          } catch (err) {
            toast.error(String(err))
          }
        },
        onDelete: async () => {
          try {
            await apiStashDrop(repoPath, index)
            mutate(['git-stashes', repoPath])
            queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
            queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          } catch (err) {
            toast.error(String(err))
          }
        },
        onEditMessage: () => {
          selectSingle(oid)
          setEditingOid(oid)
        },
        onToggleVisibility: () => {
          toggleStashVisibility(repoPath, oid)
        },
      }).catch(console.error)
      return
    }

    let targets: string[]
    if (selected.has(oid)) {
      targets = Array.from(selected)
      setPrimaryOid(oid)
    } else {
      selectSingle(oid)
      targets = [oid]
    }

    const isSingle = targets.length === 1
    const primaryShortOid = oid.slice(0, 7)

    // Fixup is only meaningful for a single commit that's part of the current
    // branch's history (HEAD or an ancestor) — otherwise it isn't rebasable. It's
    // also unavailable mid-rebase (the paused rebase leaves the index with unmerged
    // entries, so `create_fixup_commit` can't write a tree until it's resolved) and
    // with a clean working tree (nothing to stage into the fixup commit).
    const hasWorkingChanges =
      (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0) > 0
    const fixupEnabled =
      isSingle &&
      !isRebasePaused &&
      hasWorkingChanges &&
      (await apiIsCommitOnCurrentBranch(repoPath, oid).catch(() => false))

    // "Undo commit" is only meaningful for the tip commit (HEAD, top of the list) — undoing
    // any other commit would require rewriting everything above it, which is what the Reset
    // submenu is for. It also needs a parent to reset onto and is unavailable mid-rebase, same
    // as fixup above.
    const isLastCommit = nodes[0]?.commit.oid === oid
    const parentOid = clickedNode?.commit.parentOids[0]
    const undoCommitEnabled = isSingle && isLastCommit && !isRebasePaused && !!parentOid

    showCommitNativeContextMenu({
      isSingle,
      fixupEnabled,
      undoCommitEnabled,
      targetCount: targets.length,
      labels: {
        checkout: t('gitTree.contextMenu.checkout'),
        createWorktree: t('gitTree.contextMenu.createWorktree'),
        createBranch: t('gitTree.contextMenu.createBranch'),
        cherryPick: t('gitTree.contextMenu.cherryPick'),
        rebaseOnto: t('gitTree.contextMenu.rebaseOnto'),
        resetSubmenu: t('gitTree.contextMenu.resetSubmenu'),
        resetSoft: t('gitTree.contextMenu.resetSoft'),
        resetMixed: t('gitTree.contextMenu.resetMixed'),
        resetHard: t('gitTree.contextMenu.resetHard'),
        undoCommit: t('gitTree.contextMenu.undoCommit'),
        revert: t('gitTree.contextMenu.revert'),
        fixup: t('gitTree.contextMenu.fixup'),
        recompose: isSingle
          ? t('gitTree.contextMenu.recomposeOne')
          : t('gitTree.contextMenu.recomposeMany', { count: targets.length, sha: primaryShortOid }),
        interactiveRebase: isSingle
          ? t('gitTree.contextMenu.interactiveRebase')
          : t('gitTree.contextMenu.interactiveRebaseMany', { count: targets.length, sha: primaryShortOid }),
        editMessage: t('gitTree.contextMenu.reword'),
        drop: t('gitTree.contextMenu.drop'),
        moveUp: t('gitTree.contextMenu.moveUp'),
        moveDown: t('gitTree.contextMenu.moveDown'),
        copySha: t('gitTree.contextMenu.copySha'),
        copyLink: t('gitTree.contextMenu.copyLink'),
        createPatch: t('gitTree.contextMenu.createPatch'),
        compareToWorkdir: t('gitTree.contextMenu.compareToWorkdir'),
        createTag: t('gitTree.contextMenu.createTag'),
        createAnnotatedTag: t('gitTree.contextMenu.createAnnotatedTag'),
        selectedCount: t('gitTree.contextMenu.selectedCount', { count: targets.length }),
      },
      onCheckout: () => handleCheckoutDetached(),
      onCreateWorktree: () => handleCreateWorktree(),
      onCreateBranch: () => setPendingAction({ kind: 'branch' }),
      onCherryPick: () => handleCherryPick(),
      onRebaseOnto: () => handleRebaseOntoCommit(),
      onReset: (mode) => setPendingAction({ kind: 'reset', mode }),
      onUndoCommit: () => {
        if (!parentOid) return
        const parentNode = nodes.find((n) => n.commit.oid === parentOid)
        setPendingAction({
          kind: 'reset',
          mode: 'mixed',
          targetOid: parentOid,
          targetSubject: parentNode?.commit.subject ?? '',
        })
      },
      onRevert: () => setPendingAction({ kind: 'revert' }),
      onFixup: () => void openFixupWindow(oid).catch(console.error),
      onCopySha: () => handleCopySha(),
      onCopyLink: () => handleCopyWebLink(),
      onCreatePatch: () => handleCreatePatch(),
      onCompareToWorkdir: () => setPendingAction({ kind: 'compare' }),
      onCreateTag: () => setPendingAction({ kind: 'tag', annotated: false }),
      onCreateAnnotatedTag: () => setPendingAction({ kind: 'tag', annotated: true }),
    }).catch(console.error)
  }

  return { pendingAction, setPendingAction, openMenuAt, handleCommitWip }
}
