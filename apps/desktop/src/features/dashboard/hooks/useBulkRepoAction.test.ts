import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBulkRepoAction } from './useBulkRepoAction'

const PATHS = ['/repo/a', '/repo/b', '/repo/c']

describe('useBulkRepoAction', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useBulkRepoAction())
    expect(result.current.state).toEqual({ isRunning: false, done: 0, total: 0, errors: [] })
  })

  it('runs the operation once per repo', async () => {
    const op = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run(PATHS, op)
    })
    expect(op).toHaveBeenCalledTimes(3)
    expect(op.mock.calls.map((c) => c[0])).toEqual(PATHS)
  })

  it('runs sequentially rather than all at once', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const op = vi.fn().mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run(PATHS, op)
    })
    expect(maxInFlight).toBe(1)
  })

  it('reports completion counts when everything succeeds', async () => {
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run(PATHS, vi.fn().mockResolvedValue(undefined))
    })
    await waitFor(() => expect(result.current.state.isRunning).toBe(false))
    expect(result.current.state).toMatchObject({ done: 3, total: 3, errors: [] })
  })

  it('keeps going after a failure and collects the error', async () => {
    const op = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('remote unreachable'))
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run(PATHS, op)
    })

    expect(op).toHaveBeenCalledTimes(3)
    expect(result.current.state.done).toBe(3)
    expect(result.current.state.errors).toEqual([
      { path: '/repo/b', message: 'remote unreachable' },
    ])
  })

  it('stringifies a non-Error rejection', async () => {
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run(['/repo/a'], vi.fn().mockRejectedValue('plain string'))
    })
    expect(result.current.state.errors).toEqual([{ path: '/repo/a', message: 'plain string' }])
  })

  it('returns the final state to the caller', async () => {
    const { result } = renderHook(() => useBulkRepoAction())
    let returned
    await act(async () => {
      returned = await result.current.run(['/repo/a'], vi.fn().mockRejectedValue(new Error('nope')))
    })
    expect(returned).toMatchObject({
      isRunning: false,
      done: 1,
      total: 1,
      errors: [{ path: '/repo/a', message: 'nope' }],
    })
  })

  it('does nothing for an empty list', async () => {
    const op = vi.fn()
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run([], op)
    })
    expect(op).not.toHaveBeenCalled()
    expect(result.current.state.isRunning).toBe(false)
  })

  it('ignores a second run started while one is still in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const op = vi.fn().mockImplementation(() => gate)
    const { result } = renderHook(() => useBulkRepoAction())

    let first: Promise<unknown>
    act(() => {
      first = result.current.run(['/repo/a'], op)
    })
    await act(async () => {
      await result.current.run(['/repo/b'], op)
    })
    expect(op).toHaveBeenCalledTimes(1)

    await act(async () => {
      release()
      await first
    })
  })

  it('resets back to idle', async () => {
    const { result } = renderHook(() => useBulkRepoAction())
    await act(async () => {
      await result.current.run(['/repo/a'], vi.fn().mockRejectedValue(new Error('nope')))
    })
    act(() => result.current.reset())
    expect(result.current.state).toEqual({ isRunning: false, done: 0, total: 0, errors: [] })
  })
})
