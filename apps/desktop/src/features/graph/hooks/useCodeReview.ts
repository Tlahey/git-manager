import { useCallback, useState } from 'react'
import { assessCodeReviewCoverage, type CodeReviewCoverage } from '@git-manager/ai'
import { apiGetAiContext, codeReviewService } from '../../../api/ai.api'
import {
  explanationKey,
  useAiExplanationStore,
  type StoredExplanation,
} from '../stores/aiExplanation.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStream, type AiStreamStatus } from '../../../hooks/useAiStream'

export type CodeReviewStatus = AiStreamStatus

/** What the review is being asked about. `working` reads the uncommitted tree; `branch` reads
 * `merge-base(baseRef, branch)..branch`, the same range a PR would contain. */
export type CodeReviewTarget = { scope: 'working' } | { scope: 'branch'; branch: string }

/**
 * Drives the AI code review for either target: fetches the right git context, refuses to ask about
 * an empty diff, and — for a branch — remembers the result.
 *
 * **One hook for two scopes**, unlike the explanations which have one hook each. Those genuinely
 * diverge (a commit's parent resolution, a branch's non-HEAD range, a working tree that is never
 * stored); a review differs only in which context call it makes and whether the answer is worth
 * keeping. Two hooks here would be the same twenty lines twice.
 *
 * **What is remembered, and what is not**, follows the same rule as the explanations: a branch
 * review is kept (expensive to produce, and the panel shows its age and the base it used, so a stale
 * one is visibly stale), a working-tree review is not (the tree changes with every keystroke and
 * nothing would tell the user their review is describing code they already fixed — a review that
 * flags a bug you have since deleted is worse than no review).
 */
export function useCodeReview(repoPath: string, target: CodeReviewTarget) {
  const { run, cancel, reset, status, error, text } = useAiStream(codeReviewService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  // The model's declared context window sizes how much diff is sent AND what counts as too big.
  const contextTokens = aiConnection.contextTokens

  const isBranch = target.scope === 'branch'
  const ref = isBranch ? target.branch : ''

  // Subscribed through the record so the panel re-renders when this branch's entry is written. The
  // working scope stores nothing, and reads `undefined` from a key it never writes.
  const stored: StoredExplanation | undefined = useAiExplanationStore((s) =>
    isBranch ? s.explanations[explanationKey(repoPath, 'branch-review', ref)] : undefined
  )
  const remember = useAiExplanationStore((s) => s.set)
  const forget = useAiExplanationStore((s) => s.clear)

  /**
   * What the last run actually read, and the window it would take to read everything.
   *
   * This is the number that matters now. While the diff budget was a constant the question was
   * "will this overflow?"; since it follows the window, the prompt never overflows — it shrinks. So
   * what the user needs is not a warning but a fact they can act on: how much of their change was
   * looked at, and what to set to have all of it looked at.
   */
  const [coverage, setCoverage] = useState<CodeReviewCoverage | null>(null)

  /** Runs one review. `baseRef` is required for (and only used by) the branch scope. */
  const review = useCallback(
    (baseRef?: string) =>
      run(
        async (requestId) => {
          if (isBranch) {
            if (!baseRef) return 'AI_NO_BRANCH_CHANGES'
            const context = await apiGetAiContext(repoPath, 'range', baseRef, ref)
            // Nothing to review on a branch level with its base — and a model asked to review an
            // empty diff will find something to say about it anyway.
            if (!context.diff.trim()) return 'AI_NO_BRANCH_CHANGES'
            const input = { context, scope: 'branch' as const, language, contextTokens }
            setCoverage(assessCodeReviewCoverage(input))
            await codeReviewService.run(aiConnection, input, requestId)
            return
          }
          const context = await apiGetAiContext(repoPath, 'working')
          if (!context.diff.trim()) return 'AI_NO_WORKING_CHANGES'
          const input = { context, scope: 'working' as const, language, contextTokens }
          setCoverage(assessCodeReviewCoverage(input))
          await codeReviewService.run(aiConnection, input, requestId)
        },
        {
          onComplete: (full) => {
            if (isBranch && baseRef) remember(repoPath, 'branch-review', ref, baseRef, full)
          },
        }
      ),
    [run, repoPath, isBranch, ref, aiConnection, language, contextTokens, remember]
  )

  /** Drops the remembered review (branch scope) and the live text — the panel's "forget" action. */
  const clear = useCallback(() => {
    if (isBranch) forget(repoPath, 'branch-review', ref)
    setCoverage(null)
    reset()
  }, [forget, repoPath, isBranch, ref, reset])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    review,
    cancel,
    clear,
    status,
    isGenerating,
    error,
    /** What to render: the live stream while it runs, else the remembered answer. */
    text: isGenerating || status === 'done' ? text : (stored?.text ?? text),
    /** When the shown review was produced, or `null` for a live/never-run/unremembered one. */
    generatedAt: stored?.generatedAt ?? null,
    /** The base the remembered review used — may differ from the current one. */
    comparedTo: stored?.comparedTo ?? null,
    hasStored: stored !== undefined,
    /** What the last run read, and the window needed to read it all. `null` before the first run. */
    coverage,
  }
}
