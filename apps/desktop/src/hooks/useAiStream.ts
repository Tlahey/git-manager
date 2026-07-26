import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'

export type AiStreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'cancelled'

/** How a caller starts one generation: it has already resolved whatever git context its feature
 * needs and returns the promise of the service's `run`. Returning a string instead aborts before
 * any request is made, with that string as the error (e.g. "nothing to explain"). */
export type AiStreamStarter = () => Promise<void | string>

export interface AiStreamController {
  /**
   * Runs one streaming generation and accumulates its tokens into `text`.
   *
   * `onComplete` fires once, with the full text, only when the stream finished cleanly — not on
   * error and not on cancellation, so a caller persisting the result never stores a half-written
   * answer. It receives the text directly rather than the caller reading it back off `text`, which
   * would be a render behind.
   */
  run(start: AiStreamStarter, onComplete?: (fullText: string) => void): Promise<void>
  cancel(): Promise<void>
  /** Drops the accumulated text and returns to `idle` — used when the subject changes. */
  reset(): void
  status: AiStreamStatus
  error: string | null
  text: string
}

/**
 * The `ai:*` event plumbing shared by the read-only streaming features (file-change and branch
 * explanations): subscribe, accumulate tokens, resolve a terminal state, tear the listeners down.
 *
 * Extracted because it is otherwise copied per feature — the commit-message and PR-description
 * hooks each carry their own copy, which is where the two subtle bugs this version fixes came from:
 * listeners that outlive an unmounted panel, and a second `run()` stacking a new listener set on
 * top of the previous one. It deliberately owns the text (these features render it themselves)
 * rather than pushing tokens through callbacks like the two composer hooks, which stream into an
 * input the caller owns.
 *
 * Note on the error path: nothing in the Rust backend actually emits `ai:error` — a provider
 * failure rejects the `invoke` promise instead, so it surfaces through `start()` throwing. The
 * listener is kept because the event is part of the documented provider contract, and a future
 * provider that emits it should not be silently ignored.
 */
export function useAiStream(cancelGeneration: () => Promise<void>): AiStreamController {
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      unlistenRef.current?.()
      unlistenRef.current = null
    }
  }, [])

  const run = useCallback(async (start: AiStreamStarter, onComplete?: (full: string) => void) => {
    setStatus('connecting')
    setError(null)
    setText('')

    // A previous run's listeners would otherwise double every token of this one.
    unlistenRef.current?.()
    unlistenRef.current = null

    // Mirrors the `text` state so the done handler has the finished string in hand: reading it from
    // state there would see the value from before this run's tokens were applied.
    let accumulated = ''

    const unlistenToken = await listen<string>('ai:token', (e) => {
      accumulated += e.payload
      setText((current) => current + e.payload)
      setStatus('streaming')
    })
    const unlistenDone = await listen<void>('ai:done', () => {
      setStatus('done')
      cleanup()
      if (accumulated) onComplete?.(accumulated)
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
      const refusal = await start()
      if (typeof refusal === 'string') {
        setStatus('error')
        setError(refusal)
        cleanup()
      }
    } catch (err) {
      setStatus('error')
      setError(String(err))
      cleanup()
    }
  }, [])

  const cancel = useCallback(async () => {
    await cancelGeneration()
  }, [cancelGeneration])

  const reset = useCallback(() => {
    unlistenRef.current?.()
    unlistenRef.current = null
    setStatus('idle')
    setError(null)
    setText('')
  }, [])

  return { run, cancel, reset, status, error, text }
}
