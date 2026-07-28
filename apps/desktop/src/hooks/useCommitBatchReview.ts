import { useRef, useState } from 'react'
import type { CommitConvention, CommitValidation, SummaryProgress } from '@git-manager/ai'
import {
  SummaryRunCancelled,
  fileSummaryFeature,
  planCommitsFromSummaries,
  validateCommitSubject,
} from '@git-manager/ai'
import {
  apiCreateCommit,
  apiGetPendingOperation,
  apiStageFile,
  apiUnstageAll,
} from '../api/git.api'
import { apiGetAiContext, fileSummaryService, summaryGroupingService } from '../api/ai.api'
import { trackAiProgress } from '../stores/aiActivity.store'
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
  /**
   * `proposed` is a commit the model actually planned. `unplaced` is the trailing catch-all holding
   * files it never assigned — same shape, but it is not a proposal and must not read as one.
   *
   * Carried in the data rather than inferred in the view ("the last one, with no message"), because
   * that guess is wrong the moment a real proposal has its message cleared by the user.
   */
  kind: 'proposed' | 'unplaced'
}

/**
 * What reconciling the model's plan against the real working tree had to throw away.
 *
 * The reconciliation has always been strict — it has to be, since it drives real commits — but it
 * used to be strict *and silent*, and on a large changeset that reads as the feature losing work.
 * The files are never lost (the leftovers pass catches them); what vanished without trace was whole
 * **proposals**, when every path a commit named turned out to be unknown or already taken. Both
 * failures get likelier the longer the file list, which is exactly when the user is least able to
 * spot a plan quietly missing a third of its commits.
 */
export interface PlanReconciliation {
  /** Proposals dropped entirely because none of their files survived. */
  discardedProposals: number
  /** Paths the model named that are not in the working tree — invented, or mangled in transit. */
  unknownPaths: string[]
  /** Paths the model placed in more than one commit; the first commit to claim one keeps it. */
  duplicatePaths: string[]
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
  /** What the last run's plan lost to reconciliation, or `null` when it mapped cleanly. */
  const [reconciliation, setReconciliation] = useState<PlanReconciliation | null>(null)
  /** Progress of a two-phase run, or `null` on the single-shot path (which has nothing to report:
   * it is one call, and the spinner already says so). */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  /**
   * Set when the user closes the panel mid-run, and polled between calls by the planner.
   *
   * A ref, not state: the planner reads it from inside an async loop that closed over the render it
   * started in, so a state value would be frozen at `false` for the whole run.
   */
  const cancelledRef = useRef(false)

  /** Opens the review screen and immediately asks the AI to propose the commit plan. */
  async function openAndGenerate() {
    setIsOpen(true)
    await generate()
  }

  async function generate() {
    setIsGenerating(true)
    setError(null)
    setProposals([])
    setReconciliation(null)
    setProgress(null)
    cancelledRef.current = false
    try {
      // Refuse before spending a generation on a plan that could never be applied — see
      // `applyAccepted`, which re-checks because the repo can enter one of these states while the
      // user is reading the proposals.
      const pending = await apiGetPendingOperation(repoPath)
      if (pending) {
        setError(t('commitDetails.pendingOperation', { operation: pending }))
        return
      }
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
      // The declared window sizes how much of the working diff the plan is reasoned from. The file
      // list it partitions is sent whole regardless, so a small window costs grouping quality, not
      // coverage — see the leftovers pass below, which catches whatever the model still drops.
      const groupingInput = { context, contextTokens: aiConnection.contextTokens }
      // Always read file by file, whatever the size of the changeset — one way, no threshold. The
      // single prompt this replaced reached the model with most files as a bare path once the diff
      // outgrew the window, and a path is not something you can group by meaning.
      const commits = await planCommitsFromSummaries(
        groupingInput,
        {
          summarize: (summaryInput) => fileSummaryService.run(aiConnection, summaryInput),
          group: (reduceInput) => summaryGroupingService.run(aiConnection, reduceInput),
        },
        {
          onProgress: trackAiProgress(fileSummaryFeature.id, setProgress),
          shouldCancel: () => cancelledRef.current,
          concurrency: aiConnection.concurrency,
        }
      )

      const byPath = new Map(allWipChanges.map((f) => [f.path, f]))
      const assigned = new Set<string>()
      const next: EditableProposal[] = []
      const unknownPaths: string[] = []
      const duplicatePaths: string[] = []
      let discardedProposals = 0

      for (const commit of commits) {
        const files: ProcessedFileItem[] = []
        for (const path of commit.files) {
          const match = byPath.get(path)
          if (!match) {
            unknownPaths.push(path)
            continue
          }
          if (assigned.has(match.path)) {
            duplicatePaths.push(path)
            continue
          }
          files.push(match)
        }
        // Every path this commit named was unusable, so there is no commit left to propose. Counted
        // rather than skipped in silence: it is the model's grouping falling apart, and the user is
        // about to accept a plan that no longer says what the model actually proposed.
        if (files.length === 0) {
          discardedProposals += 1
          continue
        }
        files.forEach((f) => assigned.add(f.path))
        next.push({ commitMessage: commit.commitMessage, files, accepted: true, kind: 'proposed' })
      }

      setReconciliation(
        discardedProposals > 0 || unknownPaths.length > 0 || duplicatePaths.length > 0
          ? { discardedProposals, unknownPaths, duplicatePaths }
          : null
      )

      // Any file the model didn't place is surfaced as a rejected-by-default group so the user
      // decides explicitly — nothing is silently dropped or auto-committed.
      const leftovers = allWipChanges.filter((f) => !assigned.has(f.path))
      if (leftovers.length > 0) {
        next.push({ commitMessage: '', files: leftovers, accepted: false, kind: 'unplaced' })
      }

      if (next.length === 0) {
        setError(t('commitDetails.aiBatch.noChanges'))
        return
      }
      setProposals(next)
    } catch (err) {
      // The user closed the panel mid-run: there is nobody to show an error to, and a stale error
      // would be waiting for them the next time they open it.
      if (!(err instanceof SummaryRunCancelled)) setError(String(err))
    } finally {
      setIsGenerating(false)
      setProgress(null)
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

  /**
   * The proposals that will actually be committed, each paired with its index in `proposals` —
   * which is what lets a partial failure drop exactly the ones that landed.
   *
   * A checked group with an empty message is deliberately excluded rather than committed with no
   * subject; that is the leftovers group before the user has written one, and the dialog flags it.
   */
  const acceptedEntries = proposals
    .map((proposal, index) => ({ proposal, index }))
    .filter(
      ({ proposal }) =>
        proposal.accepted && proposal.commitMessage.trim() && proposal.files.length > 0
    )
  const canApply = acceptedEntries.length > 0

  /**
   * Whether the user has anything staged that applying would discard.
   *
   * Applying always resets the index, but that only *costs* something when there was a hand-picked
   * selection in it. Warning about it unconditionally meant the notice was almost always noise —
   * shown to people with nothing staged, about a loss that could not happen to them — which is how
   * a warning stops being read.
   */
  const hasStagedChanges = allWipChanges.some((f) => f.staged)

  /**
   * Creates the accepted commits in order. Starts from a clean index, then for each accepted
   * proposal stages exactly its files and commits — files in rejected proposals stay uncommitted.
   *
   * Not transactional, and it cannot be: these are real commits, created one at a time. What it
   * *is* is re-runnable. A failure partway used to leave every proposal on screen including the ones
   * already committed, so the obvious next click replayed them — re-staging files that no longer
   * differ from HEAD and asking libgit2 for a commit anyway, which happily produces an empty
   * duplicate. So the ones that landed are removed from the list before the error is shown, and
   * retrying applies only what is left.
   */
  async function applyAccepted() {
    if (!canApply || isApplying) return
    setIsApplying(true)
    setError(null)
    const appliedIndices = new Set<number>()
    try {
      // The repo may have entered a merge/rebase since the plan was generated, and this is the
      // step that writes: `apiUnstageAll` would discard a conflict resolution in progress, and
      // `apiCreateCommit` would flatten a pending merge into a single-parent commit — N times over.
      const pending = await apiGetPendingOperation(repoPath)
      if (pending) {
        setError(t('commitDetails.pendingOperation', { operation: pending }))
        return
      }
      await apiUnstageAll(repoPath)
      for (const { proposal, index } of acceptedEntries) {
        for (const file of proposal.files) {
          await apiStageFile(repoPath, file.path)
        }
        await apiCreateCommit(repoPath, proposal.commitMessage.trim())
        appliedIndices.add(index)
      }
      setIsOpen(false)
      setProposals([])
      setReconciliation(null)
      onRefresh?.()
    } catch (err) {
      if (appliedIndices.size > 0) {
        setProposals((prev) => prev.filter((_, index) => !appliedIndices.has(index)))
        // Those commits exist now: the graph and the WIP list are stale until this runs.
        onRefresh?.()
        setError(
          t('commitDetails.aiBatch.partialFailure', {
            count: appliedIndices.size,
            error: String(err),
          })
        )
      } else {
        setError(String(err))
      }
    } finally {
      setIsApplying(false)
    }
  }

  function close() {
    if (isApplying) return
    // Stops a two-phase run at its next call boundary. The call already in flight still completes —
    // the completion transport takes no request id — but its result is dropped.
    cancelledRef.current = true
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
    acceptedCount: acceptedEntries.length,
    validations,
    reconciliation,
    progress,
    hasStagedChanges,
  }
}

export type CommitBatchReview = ReturnType<typeof useCommitBatchReview>
