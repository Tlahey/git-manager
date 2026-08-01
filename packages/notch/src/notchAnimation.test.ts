import { describe, it, expect, vi } from 'vitest'
import { animateValue, linear, rafScheduler, type FrameScheduler } from './notchAnimation'

/**
 * A scheduler whose clock only moves when the test says so. Frames are drained explicitly, so
 * nothing from one test can still be queued when the next one starts — the failure mode a real
 * `requestAnimationFrame` produces in jsdom.
 */
function manualScheduler(): FrameScheduler & { advance: (ms: number) => void } {
  let time = 0
  let pending: ((now: number) => void)[] = []
  return {
    now: () => time,
    request: (callback) => {
      pending.push(callback)
    },
    advance(ms: number) {
      time += ms
      const due = pending
      pending = []
      for (const callback of due) callback(time)
    },
  }
}

describe('frame progress', () => {
  // The card's own slides are linear, where progress and distance covered are the same number.
  // This asserts against a deliberately non-linear curve anyway: `progress` exists so a caller
  // timing a second effect against the slide keeps working if the curve ever stops being linear —
  // which is the bug it was introduced for.
  const accelerating = (t: number) => t ** 3

  it('reports raw progress alongside the eased value', () => {
    const scheduler = manualScheduler()
    const frames: Array<[number, number]> = []
    void animateValue({
      from: 0,
      to: 100,
      durationMs: 100,
      ease: accelerating,
      onFrame: (value, progress) => frames.push([value, progress]),
      scheduler,
    })

    scheduler.advance(50)

    // Progress is the *time* fraction, not the eased one: half way through this tween the value
    // has moved barely an eighth of the way, so "a third there" and "a third through" are
    // different moments entirely.
    const [value, progress] = frames.at(-1)!
    expect(progress).toBeCloseTo(0.5)
    expect(value).toBeCloseTo(12.5)
  })

  it('reports a completed progress for a zero-length tween', () => {
    const frames: Array<[number, number]> = []
    void animateValue({
      from: 0,
      to: 100,
      durationMs: 0,
      ease: accelerating,
      onFrame: (value, progress) => frames.push([value, progress]),
    })

    expect(frames).toEqual([[100, 1]])
  })
})

describe('linear', () => {
  it('covers ground at the rate time passes', () => {
    // The card slides at a constant speed on purpose. An accelerating exit was what made it look
    // like it vanished mid-slide: it sat almost still for most of the animation, then bolted.
    expect(linear(0)).toBe(0)
    expect(linear(0.25)).toBe(0.25)
    expect(linear(0.5)).toBe(0.5)
    expect(linear(1)).toBe(1)
  })
})

describe('animateValue', () => {
  it('lands exactly on the target value', async () => {
    const scheduler = manualScheduler()
    const values: number[] = []
    const done = animateValue({
      from: 0,
      to: 100,
      durationMs: 100,
      ease: (t) => t,
      onFrame: (v) => values.push(v),
      scheduler,
    })

    scheduler.advance(50)
    scheduler.advance(50)
    await done

    expect(values.at(-1)).toBe(100)
  })

  it('clamps overshoot rather than sailing past the target on a long frame', async () => {
    const scheduler = manualScheduler()
    const values: number[] = []
    const done = animateValue({
      from: 0,
      to: 10,
      durationMs: 100,
      ease: (t) => t,
      onFrame: (v) => values.push(v),
      scheduler,
    })

    scheduler.advance(500)
    await done

    expect(values).toEqual([10])
  })

  it('emits the target once and never schedules a frame for a zero duration', async () => {
    const request = vi.fn()
    const values: number[] = []
    await animateValue({
      from: 0,
      to: 42,
      durationMs: 0,
      ease: (t) => t,
      onFrame: (v) => values.push(v),
      scheduler: { now: () => 0, request },
    })

    expect(values).toEqual([42])
    expect(request).not.toHaveBeenCalled()
  })

  it('stops where it is when cancelled mid-flight', async () => {
    const scheduler = manualScheduler()
    const values: number[] = []
    let cancelled = false
    const done = animateValue({
      from: 0,
      to: 100,
      durationMs: 100,
      ease: (t) => t,
      onFrame: (v) => values.push(v),
      scheduler,
      isCancelled: () => cancelled,
    })

    scheduler.advance(50)
    cancelled = true
    scheduler.advance(50)
    await done

    expect(values).toEqual([50])
  })

  it('does not await what onFrame returns, so IPC latency cannot throttle the tween', async () => {
    const scheduler = manualScheduler()
    let frames = 0
    const done = animateValue({
      from: 0,
      to: 1,
      durationMs: 100,
      ease: (t) => t,
      // A never-settling promise stands in for a slow setPosition round-trip.
      onFrame: () => {
        frames += 1
        return new Promise(() => {})
      },
      scheduler,
    })

    scheduler.advance(50)
    scheduler.advance(50)
    await done

    expect(frames).toBe(2)
  })
})

describe('rafScheduler', () => {
  it('drives real frames through requestAnimationFrame', async () => {
    const spy = vi.spyOn(globalThis, 'requestAnimationFrame')
    await new Promise<void>((resolve) => rafScheduler.request(() => resolve()))
    expect(spy).toHaveBeenCalled()
    expect(rafScheduler.now()).toBeGreaterThanOrEqual(0)
    spy.mockRestore()
  })
})
