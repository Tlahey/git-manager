import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../api/worktree.api', () => ({ apiCountDefaultFileMatches: vi.fn() }))

import { apiCountDefaultFileMatches } from '../api/worktree.api'
import { useDefaultFileMatchCounts } from './useDefaultFileMatchCounts'

const mocked = apiCountDefaultFileMatches as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDefaultFileMatchCounts', () => {
  it('returns an empty map and makes no call without a repo path', () => {
    const { result } = renderHook(() => useDefaultFileMatchCounts(null, ['.env*']))
    expect(result.current).toEqual({})
    expect(mocked).not.toHaveBeenCalled()
  })

  it('makes no call when every pattern is blank', () => {
    renderHook(() => useDefaultFileMatchCounts('/repo', ['', '  ']))
    vi.advanceTimersByTime(400)
    expect(mocked).not.toHaveBeenCalled()
  })

  it('debounces, queries only non-empty patterns, and maps counts by pattern', async () => {
    mocked.mockResolvedValue([2, 0])
    const { result } = renderHook(() =>
      useDefaultFileMatchCounts('/repo', ['.env*', '', 'nope/*'])
    )
    // Nothing before the debounce elapses.
    expect(mocked).not.toHaveBeenCalled()
    // Wrap the advance in act(): the resolved API promise triggers setState inside the hook,
    // and RTL's waitFor cannot poll under vitest fake timers (it only detects jest's).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(mocked).toHaveBeenCalledWith('/repo', ['.env*', 'nope/*'])
    expect(result.current).toEqual({ '.env*': 2, 'nope/*': 0 })
  })

  it('ignores a stale response after the patterns change', async () => {
    mocked.mockResolvedValue([5])
    const { rerender } = renderHook(
      ({ patterns }) => useDefaultFileMatchCounts('/repo', patterns),
      { initialProps: { patterns: ['.env*'] } }
    )
    // Change patterns before the first debounce fires — the first timer is cleared.
    rerender({ patterns: ['*.pem'] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    expect(mocked).toHaveBeenCalledTimes(1)
    expect(mocked).toHaveBeenCalledWith('/repo', ['*.pem'])
  })
})
