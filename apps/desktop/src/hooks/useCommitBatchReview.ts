import { useState } from 'react'
import type { CommitConvention, CommitValidation } from '@git-manager/ai'
import { validateCommitSubject } from '@git-manager/ai'
import { apiCreateCommit, apiStageFile, apiUnstageAll } from '../api/git.api'
import { apiGetAiContext, fileGroupingService } from '../api/ai.api'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'
import type { ProcessedFileItem } from '../components/git-graph/components/CommitFileList'

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

/** A single AI-proposed commit as shown on the review screen: the message and files come from the
 * model (structured output), plus the user's editable state — they can tweak the message and
 * accept or reject each commit before anything is written. */
export interface EditableProposal {
  commitMessage: string
  files: ProcessedFileItem[]
  accepted: boolean
}

/**
 * Case 2 of the AI features: "generate commit batches". Asks `@git-manager/ai`'s file-grouping
 * feature (structured JSON output) to split ALL working changes into an ordered plan of atomic
 * commits, surfaces them on a review screen where the user accepts/edits/rejects each one, then
 * creates the accepted commits in order. Only the connection config is ours — instruction, schema,
 * temperature and prompt all live in the package.
 */
export function useCommitBatchReview(
  repoPath: string,
  allWipChanges: ProcessedFileItem[],
  t: TranslateFn,
  onRefresh?: () => void
) {
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const { commitInstructions, commitPattern } = useEffectiveRepoSettings(repoPath)

  const [isOpen, setIsOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<EditableProposal[]>([])
  const [convention, setConvention] = useState<CommitConvention | null>(null)
  const [recentCommits, setRecentCommits] = useState<string[]>([])

  /** Opens the review screen and immediately asks the AI to propose the commit plan. */
  async function openAndGenerate() {
    setIsOpen(true)
    await generate()
  }

  async function generate() {
    setIsGenerating(true)
    setError(null)
    setProposals([])
    try {
      const context = await apiGetAiContext(repoPath, 'working')
      if (context.files.length === 0) {
        setError(t('commitDetails.aiBatch.noChanges'))
        return
      }
      setConvention(context.commitConvention ?? null)
      setRecentCommits(context.recentCommits ?? [])
      // The user's Settings guidance/pattern are frontend-only — merge them into the context so the
      // package injects them into the grouping prompt.
      context.commitInstructions = commitInstructions
      context.commitPattern = commitPattern
      const commits = await fileGroupingService.run(aiConnection, context)

      const byPath = new Map(allWipChanges.map((f) => [f.path, f]))
      const assigned = new Set<string>()
      const next: EditableProposal[] = []

      for (const commit of commits) {
        const files = commit.files
          .map((p) => byPath.get(p))
          .filter((f): f is ProcessedFileItem => f !== undefined && !assigned.has(f.path))
        if (files.length === 0) continue
        files.forEach((f) => assigned.add(f.path))
        next.push({ commitMessage: commit.commitMessage, files, accepted: true })
      }

      // Any file the model didn't place is surfaced as a rejected-by-default group so the user
      // decides explicitly — nothing is silently dropped or auto-committed.
      const leftovers = allWipChanges.filter((f) => !assigned.has(f.path))
      if (leftovers.length > 0) {
        next.push({ commitMessage: '', files: leftovers, accepted: false })
      }

      if (next.length === 0) {
        setError(t('commitDetails.aiBatch.noChanges'))
        return
      }
      setProposals(next)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsGenerating(false)
    }
  }

  function setMessage(index: number, commitMessage: string) {
    setProposals((prev) => prev.map((p, i) => (i === index ? { ...p, commitMessage } : p)))
  }

  function toggleAccepted(index: number) {
    setProposals((prev) => prev.map((p, i) => (i === index ? { ...p, accepted: !p.accepted } : p)))
  }

  // Best-effort structural validation per proposal against the project's convention, recomputed on
  // every render so it tracks live message edits. Non-blocking — surfaced as a warning only.
  const validations: CommitValidation[] = proposals.map((p) =>
    validateCommitSubject(p.commitMessage, {
      convention,
      recentCommits,
      userInstructions: commitInstructions,
      pattern: commitPattern,
    })
  )

  const acceptedProposals = proposals.filter(
    (p) => p.accepted && p.commitMessage.trim() && p.files.length > 0
  )
  const canApply = acceptedProposals.length > 0

  /** Creates the accepted commits in order. Starts from a clean index, then for each accepted
   * proposal stages exactly its files and commits — files in rejected proposals stay uncommitted. */
  async function applyAccepted() {
    if (!canApply || isApplying) return
    setIsApplying(true)
    setError(null)
    try {
      await apiUnstageAll(repoPath)
      for (const proposal of acceptedProposals) {
        for (const file of proposal.files) {
          await apiStageFile(repoPath, file.path)
        }
        await apiCreateCommit(repoPath, proposal.commitMessage.trim())
      }
      setIsOpen(false)
      setProposals([])
      onRefresh?.()
    } catch (err) {
      setError(String(err))
    } finally {
      setIsApplying(false)
    }
  }

  function close() {
    if (isApplying) return
    setIsOpen(false)
  }

  return {
    isOpen,
    openAndGenerate,
    regenerate: generate,
    close,
    isGenerating,
    isApplying,
    error,
    proposals,
    setMessage,
    toggleAccepted,
    applyAccepted,
    canApply,
    acceptedCount: acceptedProposals.length,
    validations,
  }
}

export type CommitBatchReview = ReturnType<typeof useCommitBatchReview>
