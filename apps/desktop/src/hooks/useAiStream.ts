import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useRef, useState } from 'react'
import { newAiRequestId } from '../lib/aiRequestId'

export type AiStreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'cancelled'

/** Payload of every `ai:*` event, mirroring the Rust `AiStreamEvent`. `token` is only set on
 * `ai:token`; the lifecycle events carry identity alone.
 *
 * Exported for the two composer hooks that still run their own listeners (see limitation 4): they
 * need the same shape and the same filter, and a second declaration of it would be free to drift. */
export interface AiStreamEvent {
  requestId: string
  token?: string
}

/** How a caller starts one generation: it has already resolved whatever git context its feature
 * needs and returns the promise of the service's `run`. Returning a string instead aborts before
 * any request is made, with that string as the error (e.g. "nothing to explain").
 *
 * It receives the `requestId` this run's listeners are filtering on, and must pass it to the
 * service — a generation started without it would emit events nothing here recognises. */
export type AiStreamStarter = (requestId: string) => Promise<void | string>

export interface AiStreamRunOptions {
  /**
   * Called with each token as it arrives, for a caller that renders the stream itself — the commit
   * box and the PR composer both stream into an input they own and control.
   *
   * This option is why those two hooks could finally stop carrying their own copy of this plumbing,
   * and with it the two bugs the copies had: listeners outliving an unmounted panel, and a second
   * run stacking a listener set on top of the previous one.
   */
  onToken?: (token: string) => void
  /**
   * Fires once, with the full text, only when the stream finished cleanly — not on error and not on
   * cancellation, so a caller persisting the result never stores a half-written answer. It receives
   * the text directly rather than the caller reading it back off `text`, which would be a render
   * behind.
   *
   * A stream that produced nothing does not fire it either: there is no result to record.
   */
  onComplete?: (fullText: string) => void
  /**
   * Whether to accumulate the stream into this hook's `text`. Defaults to `true`.
   *
   * Turn it off when the caller passes {@link onToken} and renders the text itself: otherwise every
   * token costs a second render for state nobody reads, and a 400-token PR description re-renders
   * the composer 400 extra times. `onComplete` still receives the full text either way — it is
   * accumulated in a local, not in state.
   */
  trackText?: boolean
}

export interface AiStreamController {
  /** Runs one streaming generation. By default it accumulates the tokens into `text`; see
   * {@link AiStreamRunOptions} for streaming into a caller-owned surface instead. */
  run(start: AiStreamStarter, options?: AiStreamRunOptions): Promise<void>
  cancel(): Promise<void>
  /** Drops the accumulated text and returns to `idle` — used when the subject changes. */
  reset(): void
  status: AiStreamStatus
  error: string | null
  text: string
}

/**
 * The `ai:*` event plumbing shared by the read-only streaming features (file-change, branch, commit
 * and working explanations, and the code review): subscribe, accumulate tokens, resolve a terminal
 * state, tear the listeners down.
 *
 * Extracted because it is otherwise copied per feature — the commit-message and PR-description
 * hooks each still carry their own copy, which is where the two subtle bugs this version fixes came
 * from: listeners that outlive an unmounted panel, and a second `run()` stacking a new listener set
 * on top of the previous one. It deliberately owns the text (these features render it themselves)
 * rather than pushing tokens through callbacks like the two composer hooks, which stream into an
 * input the caller owns.
 *
 * **Every listener filters on a request id.** The `ai:*` events are emitted by one Rust backend to
 * every listener in every window, so they are a broadcast bus rather than a channel. Before the id,
 * two generations running at once — a commit message being written while an explanation panel
 * streams, which nothing in the UI prevents — interleaved their tokens into both surfaces, and
 * whichever finished first ended the other. The id also makes `cancel` mean *this* generation.
 *
 * **On errors:** nothing emits an `ai:error` event; a provider failure rejects the `invoke` promise,
 * which surfaces here through `start()` throwing. That promise is already per-request, so it is the
 * right channel — a parallel event would be a second source of truth for one condition, and the two
 * would race. An earlier version listened for `ai:error` anyway; the listener was dead for as long
 * as it existed.
 */
export function useAiStream(
  cancelGeneration: (requestId: string) => Promise<void>
): AiStreamController {
  const [status, setStatus] = useState<AiStreamStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const unlistenRef = useRef<(() => void) | null>(null)
  /** The generation currently subscribed to, so `cancel` can name it. */
  const requestIdRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      unlistenRef.current?.()
      unlistenRef.current = null
    }
  }, [])

  const run = useCallback(async (start: AiStreamStarter, options: AiStreamRunOptions = {}) => {
    const { onToken, onComplete, trackText = true } = options

    setStatus('connecting')
    setError(null)
    setText('')

    // A previous run's listeners would otherwise double every token of this one.
    unlistenRef.current?.()
    unlistenRef.current = null

    const requestId = newAiRequestId()
    requestIdRef.current = requestId

    // Mirrors the `text` state so the done handler has the finished string in hand: reading it from
    // state there would see the value from before this run's tokens were applied.
    let accumulated = ''

    /** Events for another generation reach this window too — they are not ours to act on. */
    const isOurs = (event: AiStreamEvent) => event.requestId === requestId

    const unlistenToken = await listen<AiStreamEvent>('ai:token', (e) => {
      if (!isOurs(e.payload)) return
      const token = e.payload.token ?? ''
      accumulated += token
      if (trackText) setText((current) => current + token)
      onToken?.(token)
      setStatus('streaming')
    })
    const unlistenDone = await listen<AiStreamEvent>('ai:done', (e) => {
      if (!isOurs(e.payload)) return
      setStatus('done')
      cleanup()
      if (accumulated) onComplete?.(accumulated)
    })
    const unlistenCancelled = await listen<AiStreamEvent>('ai:cancelled', (e) => {
      if (!isOurs(e.payload)) return
      setStatus('cancelled')
      cleanup()
    })

    function cleanup() {
      unlistenToken()
      unlistenDone()
      unlistenCancelled()
      unlistenRef.current = null
    }

    unlistenRef.current = cleanup

    try {
      const refusal = await start(requestId)
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
    // Nothing to cancel before the first run; cancelling a finished id is a no-op in Rust.
    if (!requestIdRef.current) return
    await cancelGeneration(requestIdRef.current)
  }, [cancelGeneration])

  const reset = useCallback(() => {
    unlistenRef.current?.()
    unlistenRef.current = null
    requestIdRef.current = null
    setStatus('idle')
    setError(null)
    setText('')
  }, [])

  return { run, cancel, reset, status, error, text }
}
