import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { listeners, listen } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>()
  const listen = vi.fn(async (event: string, handler: (e: { payload: unknown }) => void) => {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event)!.add(handler)
    return () => listeners.get(event)?.delete(handler)
  })
  return { listeners, listen }
})
vi.mock('@tauri-apps/api/event', () => ({ listen }))

/** The id the hook minted for the run in flight — captured by {@link capture}, the starter these
 * tests pass in. Every `ai:*` event has to carry it or the hook ignores the event. */
let requestId = ''

/** A starter that does nothing but record the id it was handed. */
const capture = async (id: string) => {
  requestId = id
}

function emit(event: string, token?: string, id: string = requestId) {
  listeners.get(event)?.forEach((h) => h({ payload: { requestId: id, token } }))
}

import { useAiStream } from './useAiStream'

const cancelGeneration = vi.fn(async (_requestId: string) => {})

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  requestId = ''
})

describe('useAiStream', () => {
  it('starts idle and empty', () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    expect(result.current.status).toBe('idle')
    expect(result.current.text).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('accumulates tokens and resolves to done', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    expect(result.current.status).toBe('connecting')

    await act(async () => {
      emit('ai:token', 'a')
      emit('ai:token', 'b')
    })
    expect(result.current.status).toBe('streaming')
    expect(result.current.text).toBe('ab')

    await act(async () => emit('ai:done'))
    expect(result.current.status).toBe('done')
  })

  it('hands the full text to onComplete when the stream finishes cleanly', async () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onComplete })
    })
    await act(async () => {
      emit('ai:token', 'one ')
      emit('ai:token', 'two')
      emit('ai:done')
    })
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('one two')
  })

  it('does not call onComplete on cancellation or on an empty stream', async () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))

    await act(async () => {
      await result.current.run(capture, { onComplete })
    })
    await act(async () => {
      emit('ai:token', 'partial')
      emit('ai:cancelled')
    })
    expect(onComplete).not.toHaveBeenCalled()

    // A stream that produced nothing has no result worth remembering either.
    await act(async () => {
      await result.current.run(capture, { onComplete })
    })
    await act(async () => emit('ai:done'))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('treats a string returned by the starter as a refusal, not a result', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(async () => 'NOTHING_TO_DO')
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('NOTHING_TO_DO')
  })

  it('surfaces a throwing starter as an error', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('provider down')
      })
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('provider down')
  })

  it('does not stack listeners across runs — a token counts once', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    await act(async () => {
      await result.current.run(capture)
    })
    await act(async () => emit('ai:token', 'x'))
    expect(result.current.text).toBe('x')
    expect(listeners.get('ai:token')?.size).toBe(1)
  })

  it('drops every listener when unmounted mid-stream', async () => {
    const { result, unmount } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    unmount()
    expect(listeners.get('ai:token')?.size ?? 0).toBe(0)
    expect(listeners.get('ai:done')?.size ?? 0).toBe(0)
  })

  it('reset returns to idle and releases the listeners', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    await act(async () => emit('ai:token', 'x'))

    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.text).toBe('')
    expect(listeners.get('ai:token')?.size ?? 0).toBe(0)
  })

  it('reports a cancellation and delegates the stop to the caller', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    await act(async () => {
      await result.current.cancel()
      emit('ai:cancelled')
    })
    expect(cancelGeneration).toHaveBeenCalled()
    expect(result.current.status).toBe('cancelled')
  })
})

// The bug this protocol exists to kill. `ai:*` events are emitted by one Rust backend to every
// listener in every window, so before the request id they were a broadcast: a commit message being
// written while an explanation panel streamed fed each other's tokens into both surfaces, and
// whichever finished first ended the other.
describe('useAiStream — two generations at once', () => {
  it('ignores tokens belonging to another generation', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })

    await act(async () => {
      emit('ai:token', 'mine')
      emit('ai:token', ' theirs', 'some-other-generation')
    })

    expect(result.current.text).toBe('mine')
  })

  it('is not ended by another generation finishing', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    await act(async () => emit('ai:token', 'still going'))

    await act(async () => emit('ai:done', undefined, 'some-other-generation'))

    expect(result.current.status).toBe('streaming')
    expect(result.current.text).toBe('still going')
  })

  it("is not cancelled by another generation's cancellation", async () => {
    const onComplete = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onComplete })
    })
    await act(async () => emit('ai:token', 'kept'))

    await act(async () => emit('ai:cancelled', undefined, 'some-other-generation'))
    expect(result.current.status).toBe('streaming')

    // And still completes normally on its own event.
    await act(async () => emit('ai:done'))
    expect(result.current.status).toBe('done')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('kept')
  })

  it('mints a fresh id per run, so a late event from the previous one is ignored', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })
    const first = requestId

    await act(async () => {
      await result.current.run(capture)
    })
    expect(requestId).not.toBe(first)

    await act(async () => emit('ai:token', 'stale', first))
    expect(result.current.text).toBe('')
  })

  it('cancels by id, so the stop button cannot stop someone else', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture)
    })

    await act(async () => {
      await result.current.cancel()
    })

    expect(cancelGeneration).toHaveBeenCalledWith(requestId)
  })

  it('does not call cancel before anything has run', async () => {
    // Nothing to name, so nothing to cancel — an untargeted call is what used to stop every stream.
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.cancel()
    })
    expect(cancelGeneration).not.toHaveBeenCalled()
  })
})

// The option set that let the commit box and the PR composer stop carrying their own copy of this
// plumbing: they stream into an input they own, so they need the tokens forwarded and do not want
// them accumulated here as well.
describe('useAiStream — streaming into a caller-owned surface', () => {
  it('forwards every token to onToken, in order', async () => {
    const onToken = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onToken })
    })

    await act(async () => {
      emit('ai:token', 'one ')
      emit('ai:token', 'two')
    })

    expect(onToken.mock.calls).toEqual([['one '], ['two']])
  })

  it('still accumulates into text by default, alongside onToken', async () => {
    const onToken = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onToken })
    })
    await act(async () => emit('ai:token', 'kept'))

    expect(result.current.text).toBe('kept')
  })

  it('skips the text state when trackText is off', async () => {
    // Otherwise every token costs a second render for state nobody reads — 400 of them on a PR
    // description the composer is already rendering itself.
    const onToken = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onToken, trackText: false })
    })

    await act(async () => {
      emit('ai:token', 'a')
      emit('ai:token', 'b')
    })

    expect(result.current.text).toBe('')
    expect(onToken.mock.calls).toEqual([['a'], ['b']])
    expect(result.current.status).toBe('streaming')
  })

  it('gives onComplete the full text even with trackText off', async () => {
    // The full answer is accumulated in a local, not in state, so turning the state off costs the
    // caller nothing at the end of the stream.
    const onComplete = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onComplete, trackText: false })
    })

    await act(async () => {
      emit('ai:token', 'full ')
      emit('ai:token', 'answer')
      emit('ai:done')
    })

    expect(onComplete).toHaveBeenCalledExactlyOnceWith('full answer')
    expect(result.current.text).toBe('')
  })

  it('does not forward a token belonging to another generation', async () => {
    const onToken = vi.fn()
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(capture, { onToken })
    })

    await act(async () => emit('ai:token', 'theirs', 'another-generation'))

    expect(onToken).not.toHaveBeenCalled()
  })
})
