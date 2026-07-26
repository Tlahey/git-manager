import { useCallback, useState } from 'react'
import { assessWorkingExplanationCoverage, type DiffCoverage } from '@git-manager/ai'
import { apiGetAiContext, workingExplanationService } from '../api/ai.api'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream, type AiStreamStatus } from './useAiStream'

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
  const { run, cancel, reset, status, error, text } = useAiStream(workingExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  // The model's declared context window sizes how much of the working diff is sent.
  const contextTokens = aiConnection.contextTokens

  /**
   * How much of the tree the last run actually read.
   *
   * Needed here for a sharper reason than on the other panels: this summary's job is to say how many
   * *separate* things are in progress, and a model shown a third of the files will confidently name
   * a third of the work. Nothing is persisted, so no mirror ref is needed — there is no completion
   * callback storing this alongside the text.
   */
  const [coverage, setCoverage] = useState<DiffCoverage | null>(null)

  const explain = useCallback(
    () =>
      run(async (requestId) => {
        const context = await apiGetAiContext(repoPath, 'working')
        // A clean tree has nothing to summarize; asking anyway would invent work that isn't there.
        if (!context.diff.trim()) return 'AI_NO_WORKING_CHANGES'
        const input = { context, language, contextTokens }
        setCoverage(assessWorkingExplanationCoverage(input))
        await workingExplanationService.run(aiConnection, input, requestId)
      }),
    [run, repoPath, aiConnection, language, contextTokens]
  )

  const clear = useCallback(() => {
    setCoverage(null)
    reset()
  }, [reset])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel,
    /** Drops the current summary. Nothing is persisted, so this is just a reset. */
    clear,
    status,
    isGenerating,
    error,
    text,
    generatedAt: null,
    comparedTo: null,
    hasStored: false,
    /** What the shown summary read, and the window needed to read it all. */
    coverage,
  }
}
