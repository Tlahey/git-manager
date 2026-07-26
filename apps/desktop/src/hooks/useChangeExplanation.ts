import { useCallback } from 'react'
import type { ChangeExplanationFile } from '@git-manager/ai'
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

  const explain = useCallback(
    (request: ChangeExplanationRequest) =>
      run(async () => {
        if (!request.file.patch.trim()) return 'No changes to explain'
        // Language is a frontend/Settings concern (not from Rust) — inject it so the explanation is
        // written in the user's UI language.
        await changeExplanationService.run(aiConnection, { ...request, language })
      }),
    [run, aiConnection, language]
  )

  return { explain, cancel, reset, status, error, text }
}
