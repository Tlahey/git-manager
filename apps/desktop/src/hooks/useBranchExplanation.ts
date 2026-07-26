import { useCallback } from 'react'
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
  // Subscribed through the record so the panel re-renders when this branch's entry is written.
  const stored: StoredExplanation | undefined = useAiExplanationStore(
    (s) => s.explanations[explanationKey(repoPath, 'branch', branch)]
  )
  const remember = useAiExplanationStore((s) => s.set)
  const forget = useAiExplanationStore((s) => s.clear)

  const explain = useCallback(
    (baseRef: string) =>
      run(
        async () => {
          const context = await apiGetAiContext(repoPath, 'range', baseRef, branch)
          // A branch level with its base is the one case worth naming: the model would otherwise be
          // asked to explain an empty diff and would happily invent something.
          if (!context.diff.trim()) return 'AI_NO_BRANCH_CHANGES'
          await branchExplanationService.run(aiConnection, { context, language })
        },
        (full) => remember(repoPath, 'branch', branch, baseRef, full)
      ),
    [run, repoPath, branch, aiConnection, language, remember]
  )

  /** Drops the remembered explanation and the live text — the panel's "forget this" affordance. */
  const clear = useCallback(() => {
    forget(repoPath, 'branch', branch)
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
  }
}
