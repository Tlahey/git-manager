import { describe, it, expect } from 'vitest'
import { mapConcurrently, MAX_AI_CONCURRENCY } from './mapConcurrently'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Lets every pending microtask and timer callback run, so settle order is observable. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Runs `items` while recording the highest number of calls that were ever in flight together. */
function peakTracker() {
  let inFlight = 0
  let peak = 0
  return {
    get peak() {
      return peak
    },
    async wrap<T>(work: Promise<T>): Promise<T> {
      inFlight++
      peak = Math.max(peak, inFlight)
      try {
        return await work
      } finally {
        inFlight--
      }
    },
  }
}

describe('mapConcurrently', () => {
  it('runs one at a time at concurrency 1', async () => {
    const tracker = peakTracker()
    const { results } = await mapConcurrently([1, 2, 3], 1, (n) =>
      tracker.wrap(Promise.resolve(n * 2))
    )

    expect(results).toEqual([2, 4, 6])
    expect(tracker.peak).toBe(1)
  })

  it('keeps exactly the requested number in flight', async () => {
    const gates = [deferred<number>(), deferred<number>(), deferred<number>(), deferred<number>()]
    const tracker = peakTracker()

    const run = mapConcurrently([0, 1, 2, 3], 2, (i: number) => tracker.wrap(gates[i].promise))
    await tick()
    // Two dispatched, two still queued: the pool is a window, not a fan-out.
    expect(tracker.peak).toBe(2)

    gates.forEach((gate, i) => gate.resolve(i))
    await run
    expect(tracker.peak).toBe(2)
  })

  it('never opens more calls than there are items', async () => {
    const tracker = peakTracker()
    await mapConcurrently([1, 2], 8, (n) => tracker.wrap(Promise.resolve(n)))
    expect(tracker.peak).toBe(2)
  })

  /**
   * The reason `onSettled` reports an index at all. Completion order is the provider's business;
   * a caller that appended results would show a changeset's files, or a repository's history, in an
   * order that has no meaning and changes between runs.
   */
  it('returns results in input order however they settle', async () => {
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()]
    const settledIndices: number[] = []

    const run = mapConcurrently([0, 1, 2], 3, (i: number) => gates[i].promise, {
      onSettled: (_result, index) => settledIndices.push(index),
    })

    gates[2].resolve('third')
    await tick()
    gates[0].resolve('first')
    await tick()
    gates[1].resolve('second')

    const { results } = await run
    expect(settledIndices).toEqual([2, 0, 1])
    expect(results).toEqual(['first', 'second', 'third'])
  })

  it('stops dispatching once asked to, and says so', async () => {
    let started = 0
    const { results, stopped } = await mapConcurrently(
      [0, 1, 2, 3, 4, 5],
      2,
      async (n: number) => {
        started++
        return n
      },
      { shouldStop: () => started >= 3 }
    )

    expect(stopped).toBe(true)
    expect(started).toBe(3)
    // Only what was dispatched comes back — no holes, no placeholders for the abandoned items.
    expect(results).toEqual([0, 1, 2])
  })

  /**
   * A rejection must not let the run be considered over while its siblings are still talking to the
   * provider — that would leave calls landing against a run the caller has already given up on.
   */
  it('waits for the calls already in flight before rethrowing', async () => {
    const slow = deferred<number>()
    let slowFinished = false

    const run = mapConcurrently([0, 1], 2, async (i: number) => {
      if (i === 0) throw new Error('the provider refused')
      const value = await slow.promise
      slowFinished = true
      return value
    })

    await tick()
    expect(slowFinished).toBe(false)

    slow.resolve(1)
    await expect(run).rejects.toThrow()
    expect(slowFinished).toBe(true)
  })

  /**
   * The bug this pool was half of: polling only before a dispatch meant "stop" reached nothing that
   * was already talking to the provider, which on a run of one call per file is most of the wait.
   */
  it('notices a stop while a call is in flight, not only between dispatches', async () => {
    const gate = deferred<number>()
    let stop = false
    let aborted = false

    const run = mapConcurrently([0, 1, 2], 1, () => gate.promise, {
      shouldStop: () => stop,
      onStop: () => {
        aborted = true
        gate.reject(new Error('aborted'))
      },
      stopPollIntervalMs: 1,
    })

    await tick()
    // Nothing has been dispatched since the first call, so the old between-calls poll would never
    // have run again — the worker is parked on the provider.
    expect(aborted).toBe(false)

    stop = true
    await expect(run).rejects.toThrow('aborted')
    expect(aborted).toBe(true)
  })

  it('fires onStop once however many calls are in flight', async () => {
    const gates = [deferred<number>(), deferred<number>(), deferred<number>()]
    let stop = false
    let stops = 0

    const run = mapConcurrently([0, 1, 2], 3, (i: number) => gates[i].promise, {
      shouldStop: () => stop,
      onStop: () => {
        stops++
        gates.forEach((gate) => gate.resolve(0))
      },
      stopPollIntervalMs: 1,
    })

    await tick()
    stop = true
    await run
    expect(stops).toBe(1)
  })

  /** An orphaned poll would outlive the run and fire `onStop` against ids belonging to the next one. */
  it('stops polling once the run is over', async () => {
    let polls = 0
    await mapConcurrently([0, 1], 1, async (n: number) => n, {
      shouldStop: () => {
        polls++
        return false
      },
      stopPollIntervalMs: 1,
    })

    const after = polls
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(polls).toBe(after)
  })

  it('treats a nonsense width as one at a time', async () => {
    for (const width of [0, -4, Number.NaN]) {
      const tracker = peakTracker()
      const { results } = await mapConcurrently([1, 2, 3], width, (n) =>
        tracker.wrap(Promise.resolve(n))
      )
      expect(results).toEqual([1, 2, 3])
      expect(tracker.peak).toBe(1)
    }
  })

  /** The width comes from persisted settings, so the ceiling has to hold here, not just in the form. */
  it('clamps a width past the ceiling', async () => {
    const tracker = peakTracker()
    const items = Array.from({ length: MAX_AI_CONCURRENCY + 10 }, (_, i) => i)
    const gates = items.map(() => deferred<number>())

    const run = mapConcurrently(items, 500, (i: number) => tracker.wrap(gates[i].promise))
    await tick()
    expect(tracker.peak).toBe(MAX_AI_CONCURRENCY)

    gates.forEach((gate, i) => gate.resolve(i))
    await run
  })
})
