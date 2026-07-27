import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutate } from 'swr'
import type { GitStatus, GitStatusEntry, GitGraphNode } from '@git-manager/git-types'
import { toast } from '@git-manager/ui'
import {
  apiUnstageAll,
  apiStageFile,
  apiUnstageFile,
  apiCreateCommit,
  apiGetPendingOperation,
  apiStashPush,
} from '../api/git.api'
import { useAiGeneration } from './useAiGeneration'
import type { ProcessedFileItem } from '../components/git-graph/components/CommitFileList'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

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
    progress: commitProgress,
  } = useAiGeneration(repoPath)

  const isGenerating = llmStatus === 'generating'

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
      await runLlmGenerate((message: string) => {
        setBatchMessages((prev) => ({ ...prev, [groupName]: message }))
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

    // `commitBatch` checks this too — it is also reachable one group at a time — but the loop is
    // stopped here so a pending operation costs one warning rather than one per group.
    const pending = await apiGetPendingOperation(repoPath)
    if (pending) {
      toast.warning(t('commitDetails.pendingOperation', { operation: pending }))
      return
    }

    setIsCommittingAllBatches(true)
    try {
      for (const [groupName, files] of ready) {
        await commitBatch(groupName, files)
      }
    } finally {
      setIsCommittingAllBatches(false)
    }
  }

  /**
   * Stages a group's files, commits them, then restores the remaining originally staged ones.
   *
   * Refuses outright while another git operation is under way, and that refusal belongs to the
   * *batch* flows rather than to committing in general: `apiUnstageAll` below would throw away a
   * conflict resolution in progress during a paused rebase, and splitting a merge across several
   * commits is not a thing a merge can be. Finishing a merge with the ordinary Commit button is
   * legitimate, and `create_commit` handles it — see `handleCommitWip`.
   */
  async function commitBatch(groupName: string, files: typeof allWipChanges) {
    const msg = batchMessages[groupName]?.trim()
    if (!msg) {
      toast.error(t('commit.emptyMessage'))
      return
    }

    try {
      const pending = await apiGetPendingOperation(repoPath)
      if (pending) {
        toast.warning(t('commitDetails.pendingOperation', { operation: pending }))
        return
      }
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
      toast.error(String(err))
    }
  }

  // LLM Commit Generation
  function handleGenerateCommitMessage() {
    if (isGenerating) {
      cancelLlmGenerate()
      return
    }

    setCommitMessage('')
    // The message arrives whole rather than token by token; validation is reported by the hook.
    runLlmGenerate((message: string) => setCommitMessage(message))
  }

  /**
   * The ordinary Commit button. Deliberately *not* guarded against a pending operation, unlike the
   * batch flows: committing is how you finish a merge or a resolved rebase step, so refusing here
   * would break the normal workflow. `create_commit` reads `MERGE_HEAD` and produces a real merge
   * commit, and an unresolved index still fails on its own (`index.write_tree()` refuses it).
   */
  async function handleCommitWip() {
    if (!commitMessage.trim()) return
    setIsCommitting(true)
    try {
      await apiCreateCommit(repoPath, commitMessage, isAmend)
      setCommitMessage('')
      setIsAmend(false)
      onRefresh?.()
    } catch (err) {
      toast.error(String(err))
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
      toast.error(String(err))
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
    commitProgress,
  }
}
