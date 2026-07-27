import { useCallback, useState } from 'react'
import type { CommitConvention, CommitValidation, DiffCoverage } from '@git-manager/ai'
import { assessCommitMessageCoverage, validateCommitSubject } from '@git-manager/ai'
import { apiGetAiContext, commitMessageService } from '../api/ai.api'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'
import { useAiStream, type AiStreamStatus } from './useAiStream'

/** Unchanged as a name and as a set of values — it was always the same union {@link useAiStream}
 * exposes, declared twice because this hook predated the shared one. */
export type GenerationStatus = AiStreamStatus

/**
 * Streams a commit message into the WIP panel's message box.
 *
 * The `ai:*` plumbing lives in {@link useAiStream}; this hook is now only what is specific to a
 * commit message — the staged-diff context, and validating the result against the project's
 * convention. It kept its own copy of that plumbing until the shared hook learned to forward tokens
 * to a caller-owned surface (`onToken`), which is the whole reason the copy existed: the message
 * streams into an input the panel controls, not into text this hook renders.
 *
 * Two bugs came back for free with the migration, both of which the copy had: listeners that
 * outlived an unmounted panel, and a second `generate()` stacking a listener set on top of the
 * previous one.
 */
export function useAiGeneration(repoPath: string) {
  const { run, cancel, status, error } = useAiStream(commitMessageService.cancel)
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
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const { commitInstructions, commitPattern } = useEffectiveRepoSettings(repoPath)

  const generate = useCallback(
    async (onToken: (token: string) => void, onDone: (full: string) => void) => {
      setValidation(null)
      setCoverage(null)

      // Captured by the starter below, read by `onComplete` — the convention only becomes known
      // once the context has been fetched, and validating needs it.
      let convention: CommitConvention | null = null
      let recentCommits: string[] = []

      await run(
        async (requestId) => {
          // The package builds the prompt from the repo's staged changes; git2 stays in Rust.
          const context = await apiGetAiContext(repoPath, 'staged')
          // A refusal rather than a thrown error: nothing failed, there is simply nothing to write
          // a message about.
          if (!context.diff.trim()) return 'No staged changes'

          convention = context.commitConvention ?? null
          recentCommits = context.recentCommits ?? []
          // The user's Settings guidance/pattern are frontend-only — merge them into the context so
          // the package injects them into the prompt.
          context.commitInstructions = commitInstructions
          context.commitPattern = commitPattern
          // The declared window sizes how much of the staged diff the message is written from — a
          // connection property, so it is passed beside the context rather than merged into it.
          const input = { context, contextTokens: aiConnection.contextTokens }
          // Assessed from the same input the prompt is built from, and before the request rather
          // than after it: the answer arrives token by token, so waiting would put the notice on
          // screen only once the user has already read the subject.
          setCoverage(assessCommitMessageCoverage(input))
          await commitMessageService.run(aiConnection, input, requestId)
        },
        {
          onToken,
          onComplete: (full) => {
            onDone(full)
            setValidation(
              validateCommitSubject(full, {
                convention,
                recentCommits,
                userInstructions: commitInstructions,
                pattern: commitPattern,
              })
            )
          },
          // The panel accumulates the tokens into its own message box, so tracking them here as
          // well would re-render it once more per token for state nothing reads.
          trackText: false,
        }
      )
    },
    [run, repoPath, aiConnection, commitInstructions, commitPattern]
  )

  return { generate, cancel, status, error, validation, coverage }
}
