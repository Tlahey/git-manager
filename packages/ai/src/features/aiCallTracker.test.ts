import { describe, expect, it, vi } from 'vitest'
import { AiCallTracker } from './aiCallTracker'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('AiCallTracker', () => {
  /**
   * The invariant the backend's registry forces: it replaces an entry when an id is registered
   * twice and removes it when a call finishes, so two concurrent calls sharing an id would leave
   * one of them uncancellable and let the first to end unregister the other's flag.
   */
  it('gives every call an id of its own', async () => {
    const tracker = new AiCallTracker(undefined)
    const ids: string[] = []

    await Promise.all(
      Array.from({ length: 8 }, () =>
        tracker.track(async (requestId) => {
          ids.push(requestId)
        })
      )
    )

    expect(new Set(ids).size).toBe(8)
  })

  it('cancels every call still open, naming each one', async () => {
    const cancelCall = vi.fn()
    const tracker = new AiCallTracker(cancelCall)
    const first = deferred<string>()
    const second = deferred<string>()

    const running = Promise.all([
      tracker.track(() => first.promise),
      tracker.track(() => second.promise),
    ])
    expect(tracker.openCount).toBe(2)

    tracker.cancelAll()
    expect(cancelCall).toHaveBeenCalledTimes(2)
    expect(new Set(cancelCall.mock.calls.map((c) => c[0] as string)).size).toBe(2)

    first.resolve('a')
    second.resolve('b')
    await running
  })

  it('forgets a call as soon as it settles, so a later stop cannot name it', async () => {
    const cancelCall = vi.fn()
    const tracker = new AiCallTracker(cancelCall)

    await tracker.track(async () => 'done')
    await tracker
      .track(async () => {
        throw new Error('provider down')
      })
      .catch(() => {})

    expect(tracker.openCount).toBe(0)
    tracker.cancelAll()
    expect(cancelCall).not.toHaveBeenCalled()
  })

  /** A failed cancel is not something the user can act on, and must not replace a stopped run with
   * an error. */
  it('swallows a rejected cancel', async () => {
    const tracker = new AiCallTracker(() => Promise.reject(new Error('no such window')))
    const gate = deferred<string>()
    const running = tracker.track(() => gate.promise)

    expect(() => tracker.cancelAll()).not.toThrow()

    gate.resolve('a')
    await running
  })

  /**
   * The gap a stop can otherwise fall through: observed between two calls, it would cancel an empty
   * set and let the next one out — and `scanCommits` reads one commit file by file inside the pool,
   * so that one call would become every remaining file of the commit.
   */
  it('dispatches nothing more once it has been stopped', async () => {
    const tracker = new AiCallTracker(vi.fn())
    const call = vi.fn(async () => 'answer')

    tracker.cancelAll()

    await expect(tracker.track(call)).rejects.toThrow('completion-cancelled')
    expect(call).not.toHaveBeenCalled()
  })

  it('is inert when the host supplied no way to cancel', async () => {
    const tracker = new AiCallTracker(undefined)
    const gate = deferred<string>()
    const running = tracker.track(() => gate.promise)

    expect(() => tracker.cancelAll()).not.toThrow()

    gate.resolve('a')
    await expect(running).resolves.toBe('a')
  })
})
