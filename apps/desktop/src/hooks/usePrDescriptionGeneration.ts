import { listen } from '@tauri-apps/api/event'
import { useCallback, useRef, useState } from 'react'
import { apiGetAiContext, prDescriptionService } from '../api/ai.api'
import { useSettingsStore } from '../stores/settings.store'

export type PrDescriptionStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'cancelled'

/**
 * Streams an AI-written PR description into the composer. Fetches `range`-scope git context
 * (`baseRef..HEAD` — the whole branch, not one commit) and hands it plus the repo's PR template to
 * {@link prDescriptionService}. Tokens arrive via `ai:*` Tauri events, exactly like
 * {@link useAiGeneration} for commit messages.
 */
export function usePrDescriptionGeneration(repoPath: string) {
  const [status, setStatus] = useState<PrDescriptionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const settings = useSettingsStore((s) => s.settings)

  const generate = useCallback(
    async (
      baseRef: string,
      templateContent: string | null,
      onToken: (token: string) => void,
      onDone: (full: string) => void
    ) => {
      setStatus('connecting')
      setError(null)

      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      let accumulated = ''

      const unlistenToken = await listen<string>('ai:token', (e) => {
        accumulated += e.payload
        onToken(e.payload)
        setStatus('streaming')
      })

      const unlistenDone = await listen<void>('ai:done', () => {
        setStatus('done')
        onDone(accumulated)
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
        // Range context spans the whole branch vs its base; git2 stays in Rust.
        const context = await apiGetAiContext(repoPath, 'range', baseRef)
        if (!context.diff.trim()) {
          setStatus('error')
          setError('No changes to describe')
          cleanup()
          return
        }
        await prDescriptionService.run(settings.ai, { context, templateContent })
      } catch (err) {
        setStatus('error')
        setError(String(err))
        cleanup()
      }
    },
    [repoPath, settings.ai]
  )

  const cancel = useCallback(async () => {
    await prDescriptionService.cancel()
  }, [])

  return { generate, cancel, status, error }
}
