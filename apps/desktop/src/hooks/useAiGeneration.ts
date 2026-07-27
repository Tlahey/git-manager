import { useCallback, useRef, useState } from 'react'
import type {
  CommitConvention,
  CommitValidation,
  DiffCoverage,
  SummaryProgress,
} from '@git-manager/ai'
import {
  assessCommitMessageCoverage,
  composeCommitMessageFromSummaries,
  formatCommitMessage,
  shouldSummarizePerFile,
  SummaryRunCancelled,
  validateCommitSubject,
} from '@git-manager/ai'
import {
  apiGetAiContext,
  commitMessageService,
  fileSummaryService,
  summaryCommitMessageService,
} from '../api/ai.api'
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
   * How much of the staged change the message was written from.
   *
   * The one feature where this is worth saying *before* the answer is used rather than after. Every
   * other coverage line sits beside prose the user is reading and can discount; this one sits beside
   * a subject line that is about to be written into the repository's history under their name, where
   * "fix(ui): …" for a change that also rewrote the backend is permanent and looks deliberate. The
   * feature is instructed to scope the subject over the files it could not read, but the honest
   * thing is still to say that it did not read them.
   */
  const [coverage, setCoverage] = useState<DiffCoverage | null>(null)
  /**
   * Progress of a two-phase run, or `null` on the single-shot path — which has nothing to report:
   * it is one call, and it answers in a second or two.
   */
  const [progress, setProgress] = useState<SummaryProgress | null>(null)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const { commitInstructions, commitPattern } = useEffectiveRepoSettings(repoPath)

  /**
   * Set by {@link cancel}, read when the answer arrives.
   *
   * `ai_complete` is a single awaited request with no cancellation channel, so "stop" cannot call
   * anything off — it abandons the result instead. Honest for what the user is asking (they want the
   * box left alone), and the window in which it matters is now a second or two rather than the half
   * minute a reasoning model used to spend streaming.
   */
  const cancelledRef = useRef(false)

  const generate = useCallback(
    async (onMessage: (message: string) => void) => {
      setValidation(null)
      setCoverage(null)
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

        // Past a dozen staged files the single prompt can no longer carry every diff, so the subject
        // would be written from whichever files sorted first — and that subject goes into the
        // repository's history looking deliberate. Reading them one at a time costs N+1 calls, which
        // is why it is not the default for a change that already fits.
        const twoPhase = shouldSummarizePerFile(context)
        // Coverage measures how much of the staged diff the *single* prompt could carry. The
        // two-phase path has no such budget — every file is read whole, in its own prompt — so
        // reporting it there would name a shortfall that did not happen.
        setCoverage(twoPhase ? null : assessCommitMessageCoverage(input))

        const draft = twoPhase
          ? await composeCommitMessageFromSummaries(
              input,
              {
                summarize: (summaryInput) => fileSummaryService.run(aiConnection, summaryInput),
                compose: (reduceInput) =>
                  summaryCommitMessageService.run(aiConnection, reduceInput),
              },
              { onProgress: setProgress, shouldCancel: () => cancelledRef.current }
            )
          : await commitMessageService.run(aiConnection, input)
        if (cancelledRef.current) return

        const message = formatCommitMessage(draft)
        onMessage(message)
        setStatus('done')
        setValidation(
          validateCommitSubject(message, {
            convention: (context.commitConvention ?? null) as CommitConvention | null,
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

  return { generate, cancel, status, error, validation, coverage, progress }
}
