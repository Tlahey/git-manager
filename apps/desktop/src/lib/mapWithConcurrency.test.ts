import { describe, expect, it } from 'vitest'
import { mapWithConcurrency } from './mapWithConcurrency'

/** A promise plus the handle to settle it, so a test decides when a "request" comes back. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('mapWithConcurrency', () => {
  it('answers like Promise.all — same order, same values', async () => {
    const doubled = await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n * 2)
    expect(doubled).toEqual([2, 4, 6, 8])
  })

  it('passes the index, so a caller can key on position', async () => {
    expect(await mapWithConcurrency(['a', 'b'], 1, async (v, i) => `${i}:${v}`)).toEqual([
      '0:a',
      '1:b',
    ])
  })

  it('never has more than `limit` in flight', async () => {
    // The whole reason this exists: the dashboard used a bare Promise.all and opened seventy-five
    // connections at once, which is the shape GitHub's secondary rate limits exist to stop.
    const gates = Array.from({ length: 10 }, () => deferred<void>())
    let inFlight = 0
    let peak = 0

    const all = mapWithConcurrency(gates, 3, async (gate) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await gate.promise
      inFlight--
      return null
    })

    // Let the first wave start, then release the gates one at a time.
    await Promise.resolve()
    expect(peak).toBe(3)
    for (const gate of gates) {
      gate.resolve()
      await Promise.resolve()
    }
    await all
    expect(peak).toBe(3)
  })

  it('starts the next item as soon as any worker frees up, not in fixed slices', async () => {
    // Slicing the work per worker would leave one idle behind a single slow pull request while its
    // share of the queue waited.
    const slow = deferred<void>()
    const started: number[] = []
    const items = [0, 1, 2]

    const all = mapWithConcurrency(items, 1, async (n) => {
      started.push(n)
      if (n === 0) await slow.promise
      return n
    })

    await Promise.resolve()
    expect(started).toEqual([0])
    slow.resolve()
    await all
    expect(started).toEqual([0, 1, 2])
  })

  it('handles an empty list and a limit larger than the work', async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([])
    expect(await mapWithConcurrency([1], 99, async (n) => n)).toEqual([1])
  })

  it('propagates a rejection, exactly as Promise.all would', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async (n) => {
        if (n === 2) throw new Error('boom')
        return n
      })
    ).rejects.toThrow()
  })
})
