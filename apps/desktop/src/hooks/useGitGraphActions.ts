import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import type { GitGraphNode, GitStatus } from '@git-manager/git-types'
import { showCommitNativeContextMenu, showStashNativeContextMenu } from '../api/nativeMenu.api'
import {
  apiStashApply,
  apiStashPop,
  apiStashDrop,
  apiCreateFixupCommit,
  apiCreateCommit,
  apiStageAll,
} from '../api/git.api'
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
  t: TranslateFn
}

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
  t,
}: UseGitGraphActionsParams) {
  const queryClient = useQueryClient()
  const setEditingOid = useRepoUIStore((s) => s.setEditingOid)

  const [pendingAction, setPendingAction] = useState<'reset' | 'revert' | 'branch' | null>(null)
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(id)
  }, [toast])

  async function handleCopySha() {
    if (!primaryOid) return
    await navigator.clipboard.writeText(primaryOid)
    setToast({ kind: 'ok', msg: t('gitTree.contextMenu.shaCopied') })
  }

  async function handleFixup() {
    if (!primaryOid) return
    try {
      await apiCreateFixupCommit(repoPath, primaryOid)
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['pending-fixups', repoPath] })
      setToast({ kind: 'ok', msg: t('gitTree.contextMenu.fixupCreated') })
    } catch (err) {
      setToast({ kind: 'error', msg: String(err) })
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
      setToast({ kind: 'error', msg: String(err) })
    }
  }

  function openMenuAt(e: React.MouseEvent, oid: string) {
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
            alert(String(err))
          }
        },
        onPop: async () => {
          try {
            await apiStashPop(repoPath, index)
            mutate(['git-stashes', repoPath])
            queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
            queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          } catch (err) {
            alert(String(err))
          }
        },
        onDelete: async () => {
          try {
            await apiStashDrop(repoPath, index)
            mutate(['git-stashes', repoPath])
            queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
            queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
          } catch (err) {
            alert(String(err))
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

    showCommitNativeContextMenu({
      isSingle,
      targetCount: targets.length,
      onReset: () => setPendingAction('reset'),
      onRevert: () => setPendingAction('revert'),
      onCreateBranch: () => setPendingAction('branch'),
      onCopySha: () => handleCopySha(),
      onFixup: () => handleFixup(),
    }).catch(console.error)
  }

  return { pendingAction, setPendingAction, toast, openMenuAt, handleCommitWip }
}
