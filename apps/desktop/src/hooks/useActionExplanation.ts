import { useCallback } from 'react'
import { actionExplanationService } from '../api/ai.api'
import type { PooledAction } from '../lib/actionPool'
import {
  useActionExplanationStore,
  type StoredActionExplanation,
} from '../stores/actionExplanation.store'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream, type AiStreamStatus } from './useAiStream'

export type ActionExplanationStatus = AiStreamStatus

/** Last path segment of a repository path — what a prompt should call the project. */
function repoNameOf(repoPath: string | undefined): string | undefined {
  if (!repoPath) return undefined
  return repoPath.split('/').filter(Boolean).pop() ?? repoPath
}

/**
 * Drives one action's explanation in the "Behind the scenes" journal.
 *
 * The thinnest of the explanation hooks, and deliberately so: everything the model needs was recorded
 * as the action ran, so there is **no git data to fetch** — no `get_ai_context`, no diff, and none of
 * the per-file map phase the branch and commit explanations run before their first token. One call,
 * straight to the stream.
 *
 * A successful run is remembered per action id. Unlike a branch summary, that answer never goes stale:
 * an action already happened and the commands it ran cannot change. The age is still shown, because a
 * poor *explanation* is worth redoing even when its subject is frozen.
 *
 * `action` is nullable so the journal can call this unconditionally at the top of its render while no
 * row is selected — a hook cannot be called behind a condition, and the alternative was a second
 * component whose only job was to have an action.
 */
export function useActionExplanation(action: PooledAction | null) {
  const { run, cancel, reset, status, error, text } = useAiStream(actionExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  const stored: StoredActionExplanation | undefined = useActionExplanationStore((s) =>
    action ? s.explanations[action.id] : undefined
  )
  const remember = useActionExplanationStore((s) => s.set)
  const forget = useActionExplanationStore((s) => s.clear)

  const explain = useCallback(
    () =>
      run(
        async (requestId) => {
          // Guarded rather than assumed: the panel only renders with an action, but `run` is a
          // callback the caller holds and could fire after the selection was cleared.
          if (!action) return 'AI_NO_ACTION'

          await actionExplanationService.run(
            aiConnection,
            {
              action: action.label,
              repoName: repoNameOf(action.repoPath),
              commands: action.commands.map((command) => ({
                lines: command.lines,
                operation: command.command,
                status: command.status,
                error: command.error,
              })),
              language,
              contextTokens: aiConnection.contextTokens,
            },
            requestId
          )
        },
        { onComplete: (full) => action && remember(action.id, full) }
      ),
    [run, action, aiConnection, language, remember]
  )

  const clear = useCallback(() => {
    if (action) forget(action.id)
    reset()
  }, [forget, action, reset])

  const isGenerating = status === 'connecting' || status === 'streaming'

  return {
    explain,
    cancel,
    clear,
    status,
    isGenerating,
    error,
    // While a run is live the stream is the truth; otherwise fall back to what was remembered, which
    // is what makes reopening an already-explained action instant.
    text: isGenerating || status === 'done' ? text : (stored?.text ?? text),
    generatedAt: stored?.generatedAt ?? null,
    hasStored: stored !== undefined,
  }
}
