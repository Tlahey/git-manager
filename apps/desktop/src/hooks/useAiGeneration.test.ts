import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { AiContext } from '@git-manager/ai'

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

/** The request id the hook minted for the generation in flight, read back off the mocked service.
 * Every `ai:*` event now carries one and every listener filters on it, so an event emitted without
 * the right id is ignored — see the cross-talk tests below. */
function currentRequestId(): string {
  return (mockedRun.mock.calls.at(-1)?.[2] as string) ?? 'no-run-started'
}

function emit(event: string, token?: string, requestId: string = currentRequestId()) {
  listeners.get(event)?.forEach((h) => h({ payload: { requestId, token } }))
}

vi.mock('../api/ai.api', () => ({
  apiGetAiContext: vi.fn(),
  commitMessageService: {
    run: vi.fn(),
    cancel: vi.fn(),
  },
}))

import { apiGetAiContext, commitMessageService } from '../api/ai.api'
import { useAiGeneration } from './useAiGeneration'

const mockedGetContext = apiGetAiContext as unknown as ReturnType<typeof vi.fn>
const mockedRun = commitMessageService.run as unknown as ReturnType<typeof vi.fn>
const mockedCancel = commitMessageService.cancel as unknown as ReturnType<typeof vi.fn>

const context: AiContext = {
  diff: 'diff body',
  repoName: 'demo',
  branch: 'main',
  files: [{ path: 'src/a.ts', status: 'modified' }],
  // Conventional history so the adaptive validator actually enforces the format in these tests.
  recentCommits: ['feat: one', 'fix: two', 'chore: three', 'refactor: four'],
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  mockedGetContext.mockResolvedValue(context)
  mockedRun.mockResolvedValue(undefined)
})

describe('useAiGeneration', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    expect(result.current.status).toBe('idle')
  })

  it('moves to "connecting" immediately, then "streaming" as tokens arrive', async () => {
    const onToken = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(onToken, onDone)
    })
    // Listeners are registered asynchronously (await listen(...)) before generation kicks off —
    // flush microtasks so the event handlers are wired before we emit.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => emit('ai:token', 'Hello'))
    expect(onToken).toHaveBeenCalledWith('Hello')
    expect(result.current.status).toBe('streaming')

    await act(async () => {
      emit('ai:done')
      await generatePromise
    })
    expect(onDone).toHaveBeenCalledWith('Hello')
    expect(result.current.status).toBe('done')
  })

  it('accumulates multiple tokens before "done"', async () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), onDone)
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    act(() => {
      emit('ai:token', 'foo ')
      emit('ai:token', 'bar')
    })
    await act(async () => {
      emit('ai:done')
      await generatePromise
    })

    expect(onDone).toHaveBeenCalledWith('foo bar')
  })

  it('surfaces a provider failure from the rejected request, not from an event', async () => {
    // There is no `ai:error` event and there never was one — a provider failure rejects the
    // `invoke` promise, which is already this request's own channel. This hook listened for the
    // event for months regardless; the listener is gone and this is the path that actually fires.
    mockedRun.mockRejectedValueOnce(new Error('model not found'))
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('model not found')
  })

  it('sets status "cancelled" on an ai:cancelled event', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))

    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      emit('ai:cancelled')
      await generatePromise
    })

    expect(result.current.status).toBe('cancelled')
  })

  it('errors without calling the service when there are no staged changes', async () => {
    mockedGetContext.mockResolvedValue({ ...context, diff: '   ' })
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('No staged changes')
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('sets status "error" when the commit-message service itself rejects', async () => {
    mockedRun.mockRejectedValue(new Error('backend unreachable'))
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toContain('backend unreachable')
  })

  it('cleans up prior listeners from an earlier generate() call before starting a new one', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))

    await act(async () => {
      result.current.generate(vi.fn(), vi.fn())
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(listeners.get('ai:done')?.size ?? 0).toBe(1)

    await act(async () => {
      result.current.generate(vi.fn(), vi.fn())
      await Promise.resolve()
      await Promise.resolve()
    })
    // Still exactly one listener registered for ai:done — the first generate's was torn down.
    expect(listeners.get('ai:done')?.size).toBe(1)
  })

  it('validates the generated message against the project convention on done', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      emit('ai:token', 'feat: add a proper subject')
      emit('ai:done')
      await generatePromise
    })
    expect(result.current.validation?.valid).toBe(true)
  })

  it('flags a non-conventional generated message via validation', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    let generatePromise: Promise<void>
    act(() => {
      generatePromise = result.current.generate(vi.fn(), vi.fn())
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      emit('ai:token', 'just some text')
      emit('ai:done')
      await generatePromise
    })
    expect(result.current.validation?.valid).toBe(false)
  })

  it('cancel() names the generation in flight rather than stopping every one', async () => {
    mockedCancel.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })

    await act(async () => result.current.cancel())

    expect(mockedCancel).toHaveBeenCalledWith(currentRequestId())
  })

  it('cancel() does nothing before anything has been generated', async () => {
    // An untargeted cancel is precisely what used to stop an unrelated feature's stream.
    mockedCancel.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => result.current.cancel())
    expect(mockedCancel).not.toHaveBeenCalled()
  })
})

// This hook carried its own copy of the `ai:*` plumbing until `useAiStream` learned to forward
// tokens to a caller-owned surface (the commit box). The copy had two bugs; these are them.
describe('useAiGeneration — inherited from useAiStream', () => {
  it('drops its listeners when the panel unmounts mid-stream', async () => {
    const { result, unmount } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })
    expect(listeners.get('ai:token')?.size).toBe(1)

    unmount()

    expect(listeners.get('ai:token')?.size ?? 0).toBe(0)
    expect(listeners.get('ai:done')?.size ?? 0).toBe(0)
  })

  it('ignores a generation that is not its own', async () => {
    // The commit box is reachable while an explanation panel streams beside it.
    const onToken = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(onToken, onDone)
    })

    await act(async () => {
      emit('ai:token', 'someone else', 'another-generation')
      emit('ai:done', undefined, 'another-generation')
    })

    expect(onToken).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.status).toBe('connecting')
  })

  it('does not blank the message box with an empty answer', async () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn(), onDone)
    })

    await act(async () => emit('ai:done'))

    expect(onDone).not.toHaveBeenCalled()
    // Nothing was written, so there is nothing to validate either.
    expect(result.current.validation).toBeNull()
  })

  it('does not validate or write back a cancelled generation', async () => {
    const onDone = vi.fn()
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn(), onDone)
    })

    await act(async () => {
      emit('ai:token', 'feat: half a subj')
      emit('ai:cancelled')
    })

    expect(onDone).not.toHaveBeenCalled()
    expect(result.current.validation).toBeNull()
    expect(result.current.status).toBe('cancelled')
  })

  it('clears the previous validation when a new generation starts', async () => {
    const { result } = renderHook(() => useAiGeneration('/repo'))
    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })
    await act(async () => {
      emit('ai:token', 'just some text')
      emit('ai:done')
    })
    expect(result.current.validation?.valid).toBe(false)

    await act(async () => {
      await result.current.generate(vi.fn(), vi.fn())
    })
    expect(result.current.validation).toBeNull()
  })
})
