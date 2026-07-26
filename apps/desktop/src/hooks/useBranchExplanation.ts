import { useCallback, useRef, useState } from 'react'
import { assessBranchExplanationCoverage, type DiffCoverage } from '@git-manager/ai'
import { apiGetAiContext, branchExplanationService } from '../api/ai.api'
import {
  explanationKey,
  useAiExplanationStore,
  type StoredExplanation,
} from '../stores/aiExplanation.store'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream, type AiStreamStatus } from './useAiStream'

export type BranchExplanationStatus = AiStreamStatus

/**
 * Drives the branch side of the explanation panel: the remembered explanation for `branch`, and a
 * way to (re)generate it.
 *
 * Fetches `range`-scope git context — `merge-base(base, branch)..branch`, the same snapshot the
 * PR-description feature consumes — and hands it to {@link branchExplanationService}. `branch` is
 * passed as the range's head rather than relying on HEAD, which is what lets the user read any
 * branch in the graph without checking it out first.
 *
 * A successful run is written to the persisted store, so reopening the panel shows the previous
 * answer immediately. Nothing regenerates on its own — {@link explain} is only called from a button.
 */
export function useBranchExplanation(repoPath: string, branch: string) {
  const { run, cancel, reset, status, error, text } = useAiStream(branchExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  // The model's declared context window sizes how much of the range diff is sent.
  const contextTokens = aiConnection.contextTokens
  // Subscribed through the record so the panel re-renders when this branch's entry is written.
  const stored: StoredExplanation | undefined = useAiExplanationStore(
    (s) => s.explanations[explanationKey(repoPath, 'branch', branch)]
  )
  const remember = useAiExplanationStore((s) => s.set)
  const forget = useAiExplanationStore((s) => s.clear)

  /**
   * How much of the branch the last run actually read, and the window it would take to read all of
   * it. A branch range is the largest diff the app builds a prompt from, so this is the feature
   * where the answer is most often a summary of a fraction — and its instruction now forbids the
   * text from admitting it, precisely so this line can say it once, accurately.
   *
   * The mirror ref exists because of *when* it is stored: the completion callback below is created
   * during the same render as this state, so it would close over the previous value.
   */
  const [coverage, setCoverage] = useState<DiffCoverage | null>(null)
  const lastCoverage = useRef<DiffCoverage | null>(null)

  const explain = useCallback(
    (baseRef: string) =>
      run(
        async (requestId) => {
          const context = await apiGetAiContext(repoPath, 'range', baseRef, branch)
          // A branch level with its base is the one case worth naming: the model would otherwise be
          // asked to explain an empty diff and would happily invent something.
          if (!context.diff.trim()) return 'AI_NO_BRANCH_CHANGES'
          const input = { context, language, contextTokens }
          const assessed = assessBranchExplanationCoverage(input)
          lastCoverage.current = assessed
          setCoverage(assessed)
          await branchExplanationService.run(aiConnection, input, requestId)
        },
        {
          onComplete: (full) =>
            remember(repoPath, 'branch', branch, baseRef, full, lastCoverage.current ?? undefined),
        }
      ),
    [run, repoPath, branch, aiConnection, language, contextTokens, remember]
  )

  /** Drops the remembered explanation and the live text — the panel's "forget this" affordance. */
  const clear = useCallback(() => {
    forget(repoPath, 'branch', branch)
    lastCoverage.current = null
    setCoverage(null)
    reset()
  }, [forget, repoPath, branch, reset])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel,
    clear,
    status,
    isGenerating,
    error,
    /** What to render: the live stream while it runs, else the remembered answer. */
    text: isGenerating || status === 'done' ? text : (stored?.text ?? text),
    /** When the shown explanation was produced, or `null` for a live/never-run one. */
    generatedAt: stored?.generatedAt ?? null,
    /** The base the remembered explanation was diffed against — may differ from the current one. */
    comparedTo: stored?.comparedTo ?? null,
    hasStored: stored !== undefined,
    /**
     * What the shown answer read, and the window needed to read it all.
     *
     * Falls back to the remembered coverage so a stored explanation keeps its caveat — without it a
     * reloaded answer would look *more* authoritative than a fresh one, having lost the only line
     * saying it was written from part of the branch.
     */
    coverage: coverage ?? stored?.coverage ?? null,
  }
}
