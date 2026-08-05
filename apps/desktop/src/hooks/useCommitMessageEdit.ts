import { useEffect, useState } from 'react'
import type { GitGraphNode, GitRef, GitStash } from '@git-manager/git-types'
import { apiCreateCommit, apiUpdateStashMessage } from '../api/git.api'
import { useRepoUIStore } from '../stores/repoUI.store'
import { toast } from '@git-manager/ui'

interface UseCommitMessageEditParams {
  commit: GitGraphNode['commit']
  repoPath: string
  isStash: boolean
  stash: GitStash | null | undefined
  refs: GitRef[]
  onRefresh?: () => void
}

/**
 * Editing a commit message (amend) or a stash's: opened through the global `editingOid` state,
 * fields reset whenever the selected commit changes, saving (amending the commit or renaming the
 * stash, whichever applies), and copying the SHA.
 */
export function useCommitMessageEdit({
  commit,
  repoPath,
  isStash,
  stash,
  refs,
  onRefresh,
}: UseCommitMessageEditParams) {
  const [copied, setCopied] = useState(false)
  const [isEditingMessage, setIsEditingMessage] = useState(false)
  const [editSubject, setEditSubject] = useState('')
  const [editBody, setEditBody] = useState('')
  const [isSavingMessage, setIsSavingMessage] = useState(false)

  const { editingOid, setEditingOid } = useRepoUIStore()

  useEffect(() => {
    if (editingOid && editingOid === commit?.oid) {
      setIsEditingMessage(true)
      setEditingOid(null)
    }
  }, [editingOid, commit?.oid, setEditingOid])

  // Reset states when the selected commit changes
  useEffect(() => {
    setIsEditingMessage(false)
    if (isStash && stash) {
      const parts = stash.message.split('\n\n')
      setEditSubject(parts[0] || '')
      setEditBody(parts.slice(1).join('\n\n') || '')
    } else {
      setEditSubject(commit?.subject ?? '')
      setEditBody(commit?.body ?? '')
    }
  }, [commit?.oid, commit?.subject, commit?.body, isStash, stash])

  async function handleUpdateCommitMessage() {
    if (!editSubject.trim()) return
    setIsSavingMessage(true)
    try {
      const fullMessage = editBody.trim()
        ? `${editSubject.trim()}\n\n${editBody.trim()}`
        : editSubject.trim()

      if (isStash) {
        const stashRef = refs?.find((r) => r.type === 'stash')
        const stashMatch = stashRef?.shortName.match(/stash@\{(\d+)\}/)
        const stashIndex = stashMatch ? parseInt(stashMatch[1], 10) : 0

        await apiUpdateStashMessage(repoPath, stashIndex, fullMessage)
        setIsEditingMessage(false)
        onRefresh?.()
        return
      }

      const commitOidToAmend = commit.oid !== 'WIP' ? commit.oid : undefined
      await apiCreateCommit(repoPath, fullMessage, true, commitOidToAmend)
      setIsEditingMessage(false)
      onRefresh?.()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setIsSavingMessage(false)
    }
  }

  async function handleCopySha() {
    await navigator.clipboard.writeText(commit.oid)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return {
    copied,
    handleCopySha,
    isEditingMessage,
    setIsEditingMessage,
    editSubject,
    setEditSubject,
    editBody,
    setEditBody,
    isSavingMessage,
    handleUpdateCommitMessage,
  }
}
