import { useCallback } from 'react'
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

  const explain = useCallback(
    () =>
      run(async () => {
        const context = await apiGetAiContext(repoPath, 'working')
        // A clean tree has nothing to summarize; asking anyway would invent work that isn't there.
        if (!context.diff.trim()) return 'AI_NO_WORKING_CHANGES'
        await workingExplanationService.run(aiConnection, { context, language })
      }),
    [run, repoPath, aiConnection, language]
  )

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel,
    /** Drops the current summary. Nothing is persisted, so this is just a reset. */
    clear: reset,
    status,
    isGenerating,
    error,
    text,
    generatedAt: null,
    comparedTo: null,
    hasStored: false,
  }
}
