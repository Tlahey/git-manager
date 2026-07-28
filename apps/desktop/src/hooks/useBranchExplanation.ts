import { useCallback, useRef, useState } from 'react'
import { fileSummaryFeature, summarizeFiles, type SummaryProgress } from '@git-manager/ai'
import { apiGetAiContext, fileSummaryService, summaryExplanationService } from '../api/ai.api'
import {
  explanationKey,
  useAiExplanationStore,
  type StoredExplanation,
} from '../stores/aiExplanation.store'
import { trackAiProgress } from '../stores/aiActivity.store'
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
  const { run, cancel, reset, status, error, text } = useAiStream(summaryExplanationService.cancel)
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
   * Progress of the map phase: one call per changed file before a word of the explanation is
   * written. On a branch — the largest changeset the app explains — that runs for a while, and a
   * stream that has not started yet looks identical to one that has hung.
   */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  /** Set by `cancel`, polled by the map loop between calls. A ref because that loop closed over the
   * render it started in. */
  const cancelledRef = useRef(false)

  const explain = useCallback(
    (baseRef: string) =>
      run(
        async (requestId) => {
          const context = await apiGetAiContext(repoPath, 'range', baseRef, branch)
          // A branch level with its base is the one case worth naming: the model would otherwise be
          // asked to explain an empty diff and would happily invent something.
          if (!context.diff.trim()) return 'AI_NO_BRANCH_CHANGES'

          // Read every file on its own before explaining anything. The single budgeted range diff
          // this replaced was the app's largest, so it was also the one most often truncated — and
          // an explanation written from a third of a branch reads exactly like one written from all
          // of it.
          cancelledRef.current = false
          const summaries = await summarizeFiles(
            context,
            (summaryInput) => fileSummaryService.run(aiConnection, summaryInput),
            contextTokens,
            {
              onProgress: trackAiProgress(fileSummaryFeature.id, setProgress),
              shouldCancel: () => cancelledRef.current,
              concurrency: aiConnection.concurrency,
            }
          )
          setProgress(null)

          await summaryExplanationService.run(
            aiConnection,
            {
              scope: 'branch',
              repoName: context.repoName,
              branch,
              branchCommits: context.rangeCommits,
              summaries,
              language,
              contextTokens,
            },
            requestId
          )
        },
        {
          onComplete: (full) => remember(repoPath, 'branch', branch, baseRef, full),
        }
      ),
    [run, repoPath, branch, aiConnection, language, contextTokens, remember]
  )

  /** Drops the remembered explanation and the live text — the panel's "forget this" affordance. */
  const clear = useCallback(() => {
    forget(repoPath, 'branch', branch)
    setProgress(null)
    reset()
  }, [forget, repoPath, branch, reset])

  /** Stops the map phase at its next call boundary, then the stream. */
  const cancelRun = useCallback(async () => {
    cancelledRef.current = true
    setProgress(null)
    await cancel()
  }, [cancel])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel: cancelRun,
    progress,
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
  }
}
