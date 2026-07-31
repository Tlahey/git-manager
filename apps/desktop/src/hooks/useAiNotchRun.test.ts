import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAiNotchRun, AI_RUN_NOTCH_GRACE_MS } from './useAiNotchRun'
import { useAiActivityStore } from '../stores/aiActivity.store'

/** Begins a run and returns its id, the way the api layer's transport wrapper does. */
function begin(featureId: string) {
  let runId = 0
  act(() => {
    runId = useAiActivityStore.getState().begin(featureId, { repoPath: '/repo' })
  })
  return runId
}

function end(runId: number) {
  act(() => {
    useAiActivityStore.getState().end(runId)
  })
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  useAiActivityStore.setState({ runs: [], progress: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useAiNotchRun', () => {
  it('is nothing while the model is idle', () => {
    const { result } = renderHook(() => useAiNotchRun())
    expect(result.current).toBeNull()
  })

  it('reports the run in flight', () => {
    const { result } = renderHook(() => useAiNotchRun())
    begin('code-review')
    expect(result.current?.featureId).toBe('code-review')
  })

  it('holds the card across the gaps in a map phase', () => {
    // The whole reason this hook exists. A map phase is one model call per *file*, each with its own
    // begin/end, so between two files the run list is genuinely empty — rendered literally, a
    // forty-file analysis would open and destroy forty OS windows, animation and all.
    const { result } = renderHook(() => useAiNotchRun())

    const first = begin('file-summary')
    end(first)
    advance(50)
    expect(result.current).not.toBeNull()

    const second = begin('file-summary')
    expect(result.current?.runId).toBe(second)
  })

  it('lets go once the run really is over', () => {
    const { result } = renderHook(() => useAiNotchRun())
    const runId = begin('file-summary')
    end(runId)

    advance(AI_RUN_NOTCH_GRACE_MS - 1)
    expect(result.current).not.toBeNull()

    advance(1)
    expect(result.current).toBeNull()
  })

  it('does not restart the countdown on every gap, keeping the card alive forever', () => {
    // A sequential phase re-enters the "nothing running" branch after every file. Re-arming there
    // would mean the card never went away once the phase had ended.
    const { result } = renderHook(() => useAiNotchRun())
    const runId = begin('file-summary')
    end(runId)

    // Something else nudges the store while the countdown is already ticking.
    advance(AI_RUN_NOTCH_GRACE_MS / 2)
    act(() => {
      useAiActivityStore.setState({ runs: [] })
    })
    advance(AI_RUN_NOTCH_GRACE_MS / 2)

    expect(result.current).toBeNull()
  })

  it('shows the newest when two overlap', () => {
    // The one the user just triggered — the same rule the footer pill follows.
    const { result } = renderHook(() => useAiNotchRun())
    begin('code-review')
    const second = begin('summary-grouping')
    expect(result.current?.runId).toBe(second)
  })

  it('stands aside for a feature that has its own card', () => {
    const { result } = renderHook(() => useAiNotchRun())
    begin('commit-relevance')
    expect(result.current).toBeNull()
  })

  it('still reports an ordinary run happening alongside a commit search', () => {
    const { result } = renderHook(() => useAiNotchRun())
    begin('commit-relevance')
    begin('code-review')
    expect(result.current?.featureId).toBe('code-review')
  })

  it('drops its pending countdown when it unmounts', () => {
    const { result, unmount } = renderHook(() => useAiNotchRun())
    const runId = begin('file-summary')
    end(runId)
    unmount()

    // The assertion is that advancing past the grace period doesn't set state on a dead hook —
    // React would warn, and the test's own act() would surface it.
    advance(AI_RUN_NOTCH_GRACE_MS * 2)
    expect(result.current).not.toBeNull()
  })
})
