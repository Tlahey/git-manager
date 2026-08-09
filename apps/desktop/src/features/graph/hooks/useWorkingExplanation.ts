import { useCallback, useRef, useState } from 'react'
import {
  fileSummaryFeature,
  summarizeFiles,
  summaryExplanationFeature,
  type SummaryProgress,
} from '@git-manager/ai'
import { apiGetAiContext, fileSummaryService, summaryExplanationService } from '../../../api/ai.api'
import { trackAiProgress } from '../../../stores/aiActivity.store'
import { useSettingsStore } from '../../../stores/settings.store'
import { useAiStream, type AiStreamStatus } from '../../../hooks/useAiStream'

export type WorkingExplanationStatus = AiStreamStatus

/**
 * Drives the working-changes summary: everything uncommitted, in one reading.
 *
 * **Deliberately not remembered**, unlike the branch and commit summaries. Those describe something
 * that is fixed (a commit) or at least slow-moving (a branch); the working tree changes with every
 * keystroke, so a stored answer would be wrong within minutes and there is no reliable way to notice
 * — no sha to compare, no ref that moved. Showing a stale summary of *your own uncommitted work* as
 * if it were current is worse than making you wait for a fresh one.
 *
 * Its shape still matches the other two so it can drive the same panel: `generatedAt`/`hasStored`
 * are simply always empty, which the shell renders as "no age line" and "generate on open, every
 * time".
 */
export function useWorkingExplanation(repoPath: string) {
  const { run, cancel, reset, status, error, text } = useAiStream(summaryExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  // The model's declared context window sizes how much of the working diff is sent.
  const contextTokens = aiConnection.contextTokens

  /**
   * Progress of the map phase: one call per changed file before the summary starts streaming.
   *
   * It matters more here than on the other panels for the reason the coverage line used to: this
   * summary's job is to say how many *separate* things are in progress, so the reader needs to know
   * the reading is still going rather than that it found one thing.
   */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  /** Set by `cancel`, polled by the map loop between calls — a ref, since that loop closed over the
   * render that started it. */
  const cancelledRef = useRef(false)

  const explain = useCallback(
    () =>
      run(async (requestId) => {
        const context = await apiGetAiContext(repoPath, 'working')
        // A clean tree has nothing to summarize; asking anyway would invent work that isn't there.
        if (!context.diff.trim()) return 'AI_NO_WORKING_CHANGES'
        // Read every changed file on its own before summarizing anything.
        cancelledRef.current = false
        const summaries = await summarizeFiles(
          context,
          (summaryInput) => fileSummaryService.run(aiConnection, summaryInput),
          contextTokens,
          {
            onProgress: trackAiProgress(
              fileSummaryFeature.id,
              summaryExplanationFeature.id,
              setProgress
            ),
            shouldCancel: () => cancelledRef.current,
            concurrency: aiConnection.concurrency,
          }
        )
        setProgress(null)

        await summaryExplanationService.run(
          aiConnection,
          { scope: 'working', repoName: context.repoName, summaries, language, contextTokens },
          requestId
        )
      }),
    [run, repoPath, aiConnection, language, contextTokens]
  )

  const clear = useCallback(() => {
    setProgress(null)
    reset()
  }, [reset])

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
    /** Drops the current summary. Nothing is persisted, so this is just a reset. */
    clear,
    status,
    isGenerating,
    error,
    text,
    generatedAt: null,
    comparedTo: null,
    hasStored: false,
  }
}
