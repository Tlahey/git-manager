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

function emit(event: string, payload?: unknown) {
  listeners.get(event)?.forEach((h) => h({ payload }))
}

import { useAiStream } from './useAiStream'

const cancelGeneration = vi.fn(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
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
      await result.current.run(async () => {})
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
      await result.current.run(async () => {}, onComplete)
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
      await result.current.run(async () => {}, onComplete)
    })
    await act(async () => {
      emit('ai:token', 'partial')
      emit('ai:cancelled')
    })
    expect(onComplete).not.toHaveBeenCalled()

    // A stream that produced nothing has no result worth remembering either.
    await act(async () => {
      await result.current.run(async () => {}, onComplete)
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
      await result.current.run(async () => {})
    })
    await act(async () => {
      await result.current.run(async () => {})
    })
    await act(async () => emit('ai:token', 'x'))
    expect(result.current.text).toBe('x')
    expect(listeners.get('ai:token')?.size).toBe(1)
  })

  it('drops every listener when unmounted mid-stream', async () => {
    const { result, unmount } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(async () => {})
    })
    unmount()
    expect(listeners.get('ai:token')?.size ?? 0).toBe(0)
    expect(listeners.get('ai:done')?.size ?? 0).toBe(0)
  })

  it('reset returns to idle and releases the listeners', async () => {
    const { result } = renderHook(() => useAiStream(cancelGeneration))
    await act(async () => {
      await result.current.run(async () => {})
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
      await result.current.run(async () => {})
    })
    await act(async () => {
      await result.current.cancel()
      emit('ai:cancelled')
    })
    expect(cancelGeneration).toHaveBeenCalled()
    expect(result.current.status).toBe('cancelled')
  })
})
