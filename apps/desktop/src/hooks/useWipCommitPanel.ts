import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { GitStatus, GitStatusEntry } from '@git-manager/git-types'
import { apiUnstageAll, apiStageFile, apiUnstageFile, apiCreateCommit } from '../api/git.api'
import { useAiGeneration } from './useAiGeneration'
import { useCommitMessageHistory } from './useCommitMessageHistory'
import type { ProcessedFileItem } from '../components/git-graph/components/CommitFileList'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/**
 * Logique du panneau de commit WIP : mode classique (message unique) et mode
 * "batch commit" (regroupement par dossier racine, génération IA et commit
 * par groupe, avec restauration de l'état de staging original entre chaque
 * étape). Le découpage IA en plusieurs commits (case 2) vit dans son propre
 * écran de revue — voir `useCommitBatchReview` / `CommitBatchReviewDialog`.
 */
export function useWipCommitPanel(
  repoPath: string,
  gitStatus: GitStatus | undefined,
  allWipChanges: ProcessedFileItem[],
  t: TranslateFn,
  onRefresh?: () => void
) {
  const queryClient = useQueryClient()

  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [batchMessages, setBatchMessages] = useState<Record<string, string>>({})
  const [batchGenerating, setBatchGenerating] = useState<Record<string, boolean>>({})

  const {
    generate: runLlmGenerate,
    cancel: cancelLlmGenerate,
    status: llmStatus,
    validation: commitValidation,
  } = useAiGeneration(repoPath)
  const { history, addMessage } = useCommitMessageHistory()

  const isGenerating = llmStatus === 'connecting' || llmStatus === 'streaming'

  // Default grouping: bucket changed files by their top-level directory.
  const wipBatches = useMemo(() => {
    const batches: Record<string, typeof allWipChanges> = {}
    allWipChanges.forEach((f) => {
      const parts = f.path.split('/')
      const groupName = parts.length > 1 ? parts[0] : 'root'
      if (!batches[groupName]) {
        batches[groupName] = []
      }
      batches[groupName].push(f)
    })
    return batches
  }, [allWipChanges])

  // Temporarily stage files of a batch, generate message via LLM, then restore index
  async function generateMessageForBatch(groupName: string, files: typeof allWipChanges) {
    if (batchGenerating[groupName]) return

    setBatchGenerating((prev) => ({ ...prev, [groupName]: true }))
    setBatchMessages((prev) => ({
      ...prev,
      [groupName]: t('commitDetails.batchCommit.generating'),
    }))

    try {
      // 1. Get currently staged files
      const originallyStaged = (gitStatus?.staged ?? []).map((x: GitStatusEntry) => x.path)

      // 2. Unstage everything
      await apiUnstageAll(repoPath)

      // 3. Stage only files of this batch
      for (const file of files) {
        if (file.status !== 'deleted') {
          await apiStageFile(repoPath, file.path)
        } else {
          // deleted files must be unstaged/removed from index
          await apiUnstageFile(repoPath, file.path)
        }
      }

      // 4. Call the configured AI provider
      let accumulated = ''
      await new Promise<void>((resolve, reject) => {
        runLlmGenerate(
          (token: string) => {
            accumulated += token
            setBatchMessages((prev) => ({ ...prev, [groupName]: accumulated }))
          },
          (full: string) => {
            addMessage(full)
            resolve()
          }
        ).catch(reject)
      })

      // 5. Restore original staging state
      await apiUnstageAll(repoPath)
      const freshStatus = await queryClient.fetchQuery<GitStatus>({
        queryKey: ['git-status', repoPath],
      })
      const activeChanges = new Set<string>([
        ...(freshStatus?.unstaged ?? []).map((x: GitStatusEntry) => x.path),
        ...(freshStatus?.untracked ?? []),
      ])
      for (const path of originallyStaged) {
        if (activeChanges.has(path)) {
          await apiStageFile(repoPath, path)
        }
      }
      onRefresh?.()
    } catch (err) {
      setBatchMessages((prev) => ({ ...prev, [groupName]: `Error: ${String(err)}` }))
    } finally {
      setBatchGenerating((prev) => ({ ...prev, [groupName]: false }))
    }
  }

  // Stages batch files, commits them, then restores remaining originally staged
  async function commitBatch(groupName: string, files: typeof allWipChanges) {
    const msg = batchMessages[groupName]?.trim()
    if (!msg) {
      alert(t('commit.emptyMessage'))
      return
    }

    try {
      const originallyStaged = (gitStatus?.staged ?? []).map((x: GitStatusEntry) => x.path)
      const batchFileSet = new Set(files.map((x) => x.path))

      // Unstage all
      await apiUnstageAll(repoPath)

      // Stage only batch
      for (const file of files) {
        await apiStageFile(repoPath, file.path)
      }

      // Commit
      await apiCreateCommit(repoPath, msg)

      // Clear batch message
      setBatchMessages((prev) => {
        const next = { ...prev }
        delete next[groupName]
        return next
      })

      // Restore remaining originally staged files
      const freshStatus = await queryClient.fetchQuery<GitStatus>({
        queryKey: ['git-status', repoPath],
      })
      const activeChanges = new Set<string>([
        ...(freshStatus?.unstaged ?? []).map((x: GitStatusEntry) => x.path),
        ...(freshStatus?.untracked ?? []),
      ])
      for (const path of originallyStaged) {
        if (!batchFileSet.has(path) && activeChanges.has(path)) {
          await apiStageFile(repoPath, path)
        }
      }
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    }
  }

  // LLM Commit Generation
  function handleGenerateCommitMessage() {
    if (isGenerating) {
      cancelLlmGenerate()
      return
    }

    let accumulated = ''
    setCommitMessage('')
    runLlmGenerate(
      (token: string) => {
        accumulated += token
        setCommitMessage(accumulated)
      },
      (full: string) => {
        addMessage(full)
      }
    )
  }

  async function handleCommitWip() {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    try {
      await apiCreateCommit(repoPath, commitMessage)
      setCommitMessage('')
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  return {
    // Batch mode
    batchMode,
    setBatchMode,
    wipBatches,
    batchMessages,
    setBatchMessages,
    batchGenerating,
    generateMessageForBatch,
    commitBatch,
    // Classic mode
    commitMessage,
    setCommitMessage,
    isCommitting,
    handleCommitWip,
    handleGenerateCommitMessage,
    isGenerating,
    commitValidation,
    history,
    historyOpen,
    setHistoryOpen,
  }
}
