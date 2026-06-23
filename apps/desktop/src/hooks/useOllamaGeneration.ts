import { listen } from '@tauri-apps/api/event'
import { useCallback, useRef, useState } from 'react'
import { cancelGeneration, generateCommitMessage } from '../lib/tauri'
import { useSettingsStore } from '../stores/settings.store'

export type GenerationStatus =
  | 'idle'
  | 'connecting'
  | 'streaming'
  | 'done'
  | 'error'
  | 'cancelled'

export function useOllamaGeneration(repoPath: string) {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const settings = useSettingsStore((s) => s.settings)

  const generate = useCallback(
    async (
      onToken: (token: string) => void,
      onDone: (full: string) => void,
    ) => {
      setStatus('connecting')
      setError(null)

      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }

      let accumulated = ''

      const unlistenToken = await listen<string>('ollama:token', (e) => {
        accumulated += e.payload
        onToken(e.payload)
        setStatus('streaming')
      })

      const unlistenDone = await listen<void>('ollama:done', () => {
        setStatus('done')
        onDone(accumulated)
        cleanup()
      })

      const unlistenError = await listen<string>('ollama:error', (e) => {
        setStatus('error')
        setError(e.payload)
        cleanup()
      })

      const unlistenCancelled = await listen<void>('ollama:cancelled', () => {
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
        await generateCommitMessage(repoPath, settings.ollama.model)
      } catch (err) {
        setStatus('error')
        setError(String(err))
        cleanup()
      }
    },
    [repoPath, settings.ollama.model],
  )

  const cancel = useCallback(async () => {
    await cancelGeneration()
  }, [])

  return { generate, cancel, status, error }
}
