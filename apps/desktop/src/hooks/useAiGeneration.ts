import { useCallback, useRef, useState } from 'react'
import type { CommitValidation, SummaryProgress } from '@git-manager/ai'
import {
  composeCommitMessageFromSummaries,
  fileSummaryFeature,
  formatCommitMessage,
  summaryCommitMessageFeature,
  SummaryRunCancelled,
  validateCommitSubject,
} from '@git-manager/ai'
import { apiGetAiContext, fileSummaryService, summaryCommitMessageService } from '../api/ai.api'
import { trackAiProgress } from '../stores/aiActivity.store'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

/** Lifecycle of one generation. There is no `streaming` state and no `connecting`/`streaming` split
 * any more: the answer arrives in one piece, so a run is simply `generating` until it is not. */
export type GenerationStatus = 'idle' | 'generating' | 'done' | 'error' | 'cancelled'

/**
 * Generates a commit message for the staged changes and hands back the finished text.
 *
 * **Why this is not a stream.** It was one, sharing `useAiStream` with the explanation panels, and
 * that is what put "Thinking Process: 1. **Analyze the Request**…" into a user's commit box. A
 * reasoning model asked for prose deliberates first; our `max_tokens` cap cut that deliberation off
 * mid-thought; the provider, never having seen the end of the reasoning block, stopped separating it
 * and flushed the partial thinking into `content` — which the stream forwarded token by token
 * straight into the message input.
 *
 * Asking the provider not to think does not fix it (ignored by some servers, and Qwen 3.5+ dropped
 * the `/no_think` switch). Constraining the answer to JSON does: the grammar forces the first token
 * to be `{`, so there is no reasoning phase to leak, and the answer lands far short of the cap that
 * caused the spill. That makes this a one-shot completion, and a much faster one — the request that
 * produced the leak took 26 s of deliberation and now answers in one or two.
 *
 * What the two `useAiStream` migrations bought (listeners torn down on unmount, no listener stacking
 * across runs) is not lost by leaving it: there are no listeners at all now.
 */
export function useAiGeneration(repoPath: string) {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  // Best-effort structural check of the generated message against the project's convention. Null
  // until a generation completes; non-blocking (the primary guarantee is instructing the model).
  const [validation, setValidation] = useState<CommitValidation | null>(null)
  /**
   * Progress of a two-phase run, or `null` on the single-shot path — which has nothing to report:
   * it is one call, and it answers in a second or two.
   */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const { commitInstructions, commitPattern } = useEffectiveRepoSettings(repoPath)

  /**
   * Set by {@link cancel}, polled by the map phase and read again when the answer arrives.
   *
   * It used to be able to do nothing but abandon the result: `ai_complete` was a single awaited
   * request with no cancellation channel. It has one now, so stopping during the map phase — the
   * long half, one call per staged file — actually calls the request off. The **composing** call
   * that follows is still only abandoned: it is one request, it starts after the phase the user is
   * watching a progress bar for, and it answers in a second or two.
   */
  const cancelledRef = useRef(false)

  const generate = useCallback(
    async (onMessage: (message: string) => void) => {
      setValidation(null)
      setError(null)
      setStatus('generating')
      cancelledRef.current = false

      try {
        // The package builds the prompt from the repo's staged changes; git2 stays in Rust.
        const context = await apiGetAiContext(repoPath, 'staged')
        // A refusal rather than a thrown error: nothing failed, there is simply nothing to write a
        // message about.
        if (!context.diff.trim()) {
          setStatus('error')
          setError('No staged changes')
          return
        }

        // The user's Settings guidance/pattern are frontend-only — merge them into the context so
        // the package injects them into the prompt.
        context.commitInstructions = commitInstructions
        context.commitPattern = commitPattern
        // The declared window sizes how much of the staged diff the message is written from — a
        // connection property, so it is passed beside the context rather than merged into it.
        const input = { context, contextTokens: aiConnection.contextTokens }

        // Always read file by file, whatever the size of the change. The single prompt this replaced
        // wrote the subject from whichever files sorted first once the staged diff outgrew the
        // window — and that subject goes into the repository's history looking deliberate.
        const draft = await composeCommitMessageFromSummaries(
          input,
          {
            summarize: (summaryInput, requestId) =>
              fileSummaryService.run(aiConnection, summaryInput, requestId),
            compose: (reduceInput) => summaryCommitMessageService.run(aiConnection, reduceInput),
          },
          {
            onProgress: trackAiProgress(
              fileSummaryFeature.id,
              summaryCommitMessageFeature.id,
              setProgress
            ),
            shouldCancel: () => cancelledRef.current,
            cancelCall: fileSummaryService.cancel,
            concurrency: aiConnection.concurrency,
          }
        )
        if (cancelledRef.current) return

        const message = formatCommitMessage(draft)
        onMessage(message)
        setStatus('done')
        setValidation(
          validateCommitSubject(message, {
            convention: context.commitConvention ?? null,
            recentCommits: context.recentCommits ?? [],
            userInstructions: commitInstructions,
            pattern: commitPattern,
          })
        )
      } catch (err) {
        // Cancelling is not a failure: the user asked for the box to be left alone.
        if (cancelledRef.current || err instanceof SummaryRunCancelled) return
        setStatus('error')
        setError(String(err))
      } finally {
        setProgress(null)
      }
    },
    [repoPath, aiConnection, commitInstructions, commitPattern]
  )

  const cancel = useCallback(async () => {
    cancelledRef.current = true
    setStatus('cancelled')
  }, [])

  return { generate, cancel, status, error, validation, progress }
}
