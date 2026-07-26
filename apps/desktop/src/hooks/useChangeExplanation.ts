import { useCallback, useState } from 'react'
import {
  assessChangeExplanationCoverage,
  type ChangeExplanationFile,
  type DiffCoverage,
} from '@git-manager/ai'
import { changeExplanationService } from '../api/ai.api'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStream, type AiStreamStatus } from './useAiStream'

export type ChangeExplanationStatus = AiStreamStatus

/** What the caller has to provide: the file being explained plus the context it is read against.
 * Everything else (instruction, temperature, prompt, target language) is resolved here or inside
 * `@git-manager/ai`. */
export interface ChangeExplanationRequest {
  repoName: string
  file: ChangeExplanationFile
  /** Current content of the file — the context the model grounds the explanation in. */
  fileContent?: string
}

/**
 * Streams an AI explanation of one file's pending changes. The `ai:*` event plumbing lives in
 * {@link useAiStream}; what belongs here is the feature's own input — the file, its content, and
 * the UI language the explanation should be written in.
 */
export function useChangeExplanation() {
  const { run, cancel, reset, status, error, text } = useAiStream(changeExplanationService.cancel)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const language = useSettingsStore((s) => s.settings.language)
  // The declared window is split between the patch and the file's content — see the feature.
  const contextTokens = aiConnection.contextTokens

  /**
   * How much of the change the last run read. Reported per file like everywhere else, which on a
   * one-file prompt makes the useful number `requiredContextTokens`: the window that would have
   * carried both the whole patch *and* the file content it is supposed to be read against.
   */
  const [coverage, setCoverage] = useState<DiffCoverage | null>(null)

  const explain = useCallback(
    (request: ChangeExplanationRequest) =>
      run(async (requestId) => {
        if (!request.file.patch.trim()) return 'No changes to explain'
        // Language is a frontend/Settings concern (not from Rust) — inject it so the explanation is
        // written in the user's UI language.
        const input = { ...request, language, contextTokens }
        setCoverage(assessChangeExplanationCoverage(input))
        await changeExplanationService.run(aiConnection, input, requestId)
      }),
    [run, aiConnection, language, contextTokens]
  )

  const clear = useCallback(() => {
    setCoverage(null)
    reset()
  }, [reset])

  return { explain, cancel, reset: clear, status, error, text, coverage }
}
