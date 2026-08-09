import { useCallback, useRef, useState } from 'react'
import {
  fileSummaryFeature,
  summarizeFiles,
  summaryPrDescriptionFeature,
  type SummaryProgress,
} from '@git-manager/ai'
import { apiGetAiContext, fileSummaryService, summaryPrDescriptionService } from '../api/ai.api'
import { trackAiProgress } from '../stores/aiActivity.store'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream, type AiStreamStatus } from './useAiStream'

/** Unchanged as a name and as a set of values — it was always the same union {@link useAiStream}
 * exposes, declared twice because this hook predated the shared one. */
export type PrDescriptionStatus = AiStreamStatus

/**
 * Streams an AI-written PR description into the composer.
 *
 * Fetches `range`-scope git context (`baseRef..HEAD` — the whole branch, not one commit) and hands
 * it plus the repo's PR template to {@link prDescriptionService}. The `ai:*` plumbing lives in
 * {@link useAiStream}; like {@link useAiGeneration}, this hook carried its own copy until the shared
 * one learned to forward tokens to a caller-owned surface, because the description streams into a
 * textarea the composer controls.
 */
export function usePrDescriptionGeneration(repoPath: string) {
  const { run, cancel, status, error } = useAiStream(summaryPrDescriptionService.cancel)
  const settings = useSettingsStore((s) => s.settings)

  /**
   * Progress of the map phase, shown while every file is read one at a time.
   *
   * It replaces a coverage line that existed for the sharpest reason of any: this is the only
   * feature whose output *leaves the app*, and the description is forbidden from admitting its own
   * truncation — a caveat would be published on the pull request over the author's name. So the
   * author had to be told separately. Now there is nothing to admit: every file is read whole.
   */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  /** Set by `cancel`, polled by the map loop between calls. */
  const cancelledRef = useRef(false)

  const generate = useCallback(
    async (
      baseRef: string,
      templateContent: string | null,
      onToken: (token: string) => void,
      onDone: (full: string) => void
    ) => {
      await run(
        async (requestId) => {
          // Range context spans the whole branch vs its base; git2 stays in Rust.
          const context = await apiGetAiContext(repoPath, 'range', baseRef)
          if (!context.diff.trim()) return 'No changes to describe'

          // Read every file on its own before writing a word. This description gets published, so
          // one written from whichever files fitted a single prompt is the most expensive of the
          // truncation failures — and the template it must reproduce competed with the diff for the
          // same window.
          cancelledRef.current = false
          const summaries = await summarizeFiles(
            context,
            (summaryInput) => fileSummaryService.run(settings.ai, summaryInput),
            settings.ai.contextTokens,
            {
              onProgress: trackAiProgress(
                fileSummaryFeature.id,
                summaryPrDescriptionFeature.id,
                setProgress
              ),
              shouldCancel: () => cancelledRef.current,
              concurrency: settings.ai.concurrency,
            }
          )
          setProgress(null)

          await summaryPrDescriptionService.run(
            settings.ai,
            {
              repoName: context.repoName,
              branch: context.branch,
              baseRef: context.baseRef,
              branchCommits: context.rangeCommits,
              summaries,
              templateContent,
              contextTokens: settings.ai.contextTokens,
            },
            requestId
          )
        },
        {
          onToken,
          onComplete: onDone,
          // The composer owns the textarea it streams into; tracking the text here too would
          // re-render it once more per token for state nothing reads.
          trackText: false,
        }
      )
    },
    [run, repoPath, settings.ai]
  )

  /** Stops the map phase at its next call boundary, then the stream. */
  const cancelRun = useCallback(async () => {
    cancelledRef.current = true
    setProgress(null)
    await cancel()
  }, [cancel])

  return { generate, cancel: cancelRun, status, error, progress }
}
