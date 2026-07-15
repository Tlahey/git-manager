import { listen } from '@tauri-apps/api/event'
import { useCallback, useRef, useState } from 'react'
import type { CommitConvention, CommitValidation } from '@git-manager/ai'
import { validateCommitSubject } from '@git-manager/ai'
import { apiGetAiContext, commitMessageService } from '../api/ai.api'
import { useSettingsStore } from '../stores/settings.store'
import { useEffectiveRepoSettings } from './useEffectiveRepoSettings'

export type GenerationStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'cancelled'

export function useAiGeneration(repoPath: string) {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  // Best-effort structural check of the generated message against the project's convention. Null
  // until a generation completes; non-blocking (the primary guarantee is instructing the model).
  const [validation, setValidation] = useState<CommitValidation | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const aiConnection = useSettingsStore((s) => s.settings.ai)
  const { commitInstructions, commitPattern } = useEffectiveRepoSettings(repoPath)

  const generate = useCallback(
    async (onToken: (token: string) => void, onDone: (full: string) => void) => {
      setStatus('connecting')
      setError(null)
      setValidation(null)

      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      let accumulated = ''
      // Captured after the context fetch below; the done handler validates against them.
      let convention: CommitConvention | null = null
      let recentCommits: string[] = []
      const userInstructions = commitInstructions
      const pattern = commitPattern

      const unlistenToken = await listen<string>('ai:token', (e) => {
        accumulated += e.payload
        onToken(e.payload)
        setStatus('streaming')
      })

      const unlistenDone = await listen<void>('ai:done', () => {
        setStatus('done')
        onDone(accumulated)
        setValidation(
          validateCommitSubject(accumulated, { convention, recentCommits, userInstructions, pattern })
        )
        cleanup()
      })

      const unlistenError = await listen<string>('ai:error', (e) => {
        setStatus('error')
        setError(e.payload)
        cleanup()
      })

      const unlistenCancelled = await listen<void>('ai:cancelled', () => {
        setStatus('cancelled')
        cleanup()
      })

      function cleanup() {
        unlistenToken()
        unlistenDone()
        unlistenError()
        unlistenCancelled()
        unlistenRef.current = null
      }

      unlistenRef.current = cleanup

      try {
        // The package builds the prompt from the repo's staged changes; git2 stays in Rust.
        const context = await apiGetAiContext(repoPath, 'staged')
        if (!context.diff.trim()) {
          setStatus('error')
          setError('No staged changes')
          cleanup()
          return
        }
        convention = context.commitConvention ?? null
        recentCommits = context.recentCommits ?? []
        // The user's Settings guidance/pattern are frontend-only — merge them into the context so
        // the package injects them into the prompt.
        context.commitInstructions = userInstructions
        context.commitPattern = pattern
        await commitMessageService.run(aiConnection, context)
      } catch (err) {
        setStatus('error')
        setError(String(err))
        cleanup()
      }
    },
    [repoPath, aiConnection, commitInstructions, commitPattern]
  )

  const cancel = useCallback(async () => {
    await commitMessageService.cancel()
  }, [])

  return { generate, cancel, status, error, validation }
}
