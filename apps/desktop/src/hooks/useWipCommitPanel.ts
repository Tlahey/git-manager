import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import type { GitStatus, GitStatusEntry, GitGraphNode } from '@git-manager/git-types'
import { apiUnstageAll, apiStageFile, apiUnstageFile, apiCreateCommit, apiStashPush } from '../api/git.api'
import { useAiGeneration } from './useAiGeneration'
import type { ProcessedFileItem } from '../components/git-graph/components/CommitFileList'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/** `useAiGeneration.generate` requires a completion callback; both call sites here accumulate their
 * text from the token stream instead, so there is nothing left to do when it ends. */
const noop = () => {}

/**
 * Logic for the WIP commit panel: classic mode (a single message), stash mode, and "batch commit"
 * mode (grouping by top-level directory, with AI generation and a commit per group, restoring the
 * original staging state between each step).
 */
export function useWipCommitPanel(
  repoPath: string,
  gitStatus: GitStatus | undefined,
  allWipChanges: ProcessedFileItem[],
  t: TranslateFn,
  onRefresh?: () => void
) {
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'commit' | 'stash'>('commit')
  const [isAmend, setIsAmend] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(true)
  const [isStashing, setIsStashing] = useState(false)

  const [batchMode, setBatchMode] = useState(false)
  const [batchMessages, setBatchMessages] = useState<Record<string, string>>({})
  const [batchGenerating, setBatchGenerating] = useState<Record<string, boolean>>({})
  // Separate from `batchGenerating`, which is per group: these drive the two "all" buttons, whose
  // job is to stay disabled for the whole sequential run rather than for one group's turn.
  const [isGeneratingAllBatches, setIsGeneratingAllBatches] = useState(false)
  const [isCommittingAllBatches, setIsCommittingAllBatches] = useState(false)

  const {
    generate: runLlmGenerate,
    cancel: cancelLlmGenerate,
    status: llmStatus,
    validation: commitValidation,
    coverage: commitCoverage,
  } = useAiGeneration(repoPath)

  const isGenerating = llmStatus === 'connecting' || llmStatus === 'streaming'

  function handleToggleAmend(checked: boolean) {
    setIsAmend(checked)
    if (checked && !commitMessage.trim()) {
      const logData = queryClient.getQueryData<{ nodes?: GitGraphNode[] }>([
        'git-log',
        repoPath,
      ])
      if (logData?.nodes) {
        const headNode =
          logData.nodes.find((n) => n.refs?.some((r) => r.type === 'HEAD')) ||
          logData.nodes.find((n) => n.commit.oid !== 'WIP')
        if (headNode?.commit) {
          setCommitMessage(headNode.commit.message || headNode.commit.subject || '')
        }
      }
    }
  }

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
          () => resolve()
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

  /**
   * Generates a message for every group, one after another.
   *
   * Strictly sequential, and not for simplicity: each generation *re-stages the index* to isolate
   * its group (see `generateMessageForBatch`), so two running at once would each be looking at the
   * other's staging. It is also why a failure does not abort the rest — `generateMessageForBatch`
   * swallows its own error into that group's message box, so one bad group leaves the others' work
   * intact rather than discarding a run that may already have taken a minute.
   */
  async function generateAllBatchMessages() {
    if (isGeneratingAllBatches) return
    setIsGeneratingAllBatches(true)
    try {
      for (const [groupName, files] of Object.entries(wipBatches)) {
        await generateMessageForBatch(groupName, files)
      }
    } finally {
      setIsGeneratingAllBatches(false)
    }
  }

  /**
   * Commits every group that has a message, in order.
   *
   * Groups without one are skipped rather than blocking the run: a user who generated four messages
   * and deleted one meant to leave that group uncommitted. Stops at the first *failure*, though —
   * an error here means the index is in a state the next commit would build on wrongly.
   */
  async function commitAllBatches() {
    if (isCommittingAllBatches) return
    const ready = Object.entries(wipBatches).filter(([name]) => batchMessages[name]?.trim())
    if (ready.length === 0) return

    setIsCommittingAllBatches(true)
    try {
      for (const [groupName, files] of ready) {
        await commitBatch(groupName, files)
      }
    } finally {
      setIsCommittingAllBatches(false)
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
    // Nothing to do on completion: the message box already holds every token as it arrived, and
    // validation is reported by the hook itself.
    runLlmGenerate((token: string) => {
      accumulated += token
      setCommitMessage(accumulated)
    }, noop)
  }

  async function handleCommitWip() {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    try {
      await apiCreateCommit(repoPath, commitMessage, isAmend)
      setCommitMessage('')
      setIsAmend(false)
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsCommitting(false)
    }
  }

  async function handleStash() {
    setIsStashing(true)
    try {
      await apiStashPush(repoPath, stashMessage.trim() || undefined, includeUntracked)
      setStashMessage('')
      queryClient.invalidateQueries({ queryKey: ['git-status', repoPath] })
      queryClient.invalidateQueries({ queryKey: ['git-log', repoPath] })
      mutate(['git-stashes', repoPath])
      onRefresh?.()
    } catch (err) {
      alert(String(err))
    } finally {
      setIsStashing(false)
    }
  }

  return {
    activeTab,
    setActiveTab,
    isAmend,
    setIsAmend,
    handleToggleAmend,
    stashMessage,
    setStashMessage,
    includeUntracked,
    setIncludeUntracked,
    isStashing,
    handleStash,
    batchMode,
    setBatchMode,
    wipBatches,
    batchMessages,
    setBatchMessages,
    batchGenerating,
    generateMessageForBatch,
    commitBatch,
    generateAllBatchMessages,
    commitAllBatches,
    isGeneratingAllBatches,
    isCommittingAllBatches,
    commitMessage,
    setCommitMessage,
    isCommitting,
    handleCommitWip,
    handleGenerateCommitMessage,
    isGenerating,
    commitValidation,
    commitCoverage,
  }
}
