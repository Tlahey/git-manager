import { useCallback, useState } from 'react'
import { assessPrDescriptionCoverage, type DiffCoverage } from '@git-manager/ai'
import { apiGetAiContext, prDescriptionService } from '../api/ai.api'
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
  const { run, cancel, status, error } = useAiStream(prDescriptionService.cancel)
  const settings = useSettingsStore((s) => s.settings)

  /**
   * How much of the branch the draft was written from.
   *
   * The only feature whose *output leaves the app*, which is exactly why this is worth surfacing:
   * the description is forbidden from mentioning its own coverage — a caveat about truncation would
   * be published on the pull request over the author's name — so this is the one place the author
   * can learn, before they hit create, that the draft describes a third of the branch.
   */
  const [coverage, setCoverage] = useState<DiffCoverage | null>(null)

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

          const input = {
            context,
            templateContent,
            contextTokens: settings.ai.contextTokens,
          }
          setCoverage(assessPrDescriptionCoverage(input))
          await prDescriptionService.run(settings.ai, input, requestId)
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

  return { generate, cancel, status, error, coverage }
}
