import { describe, it, expect, vi } from 'vitest'
import {
  animateValue,
  easeInCubic,
  easeOutCubic,
  rafScheduler,
  type FrameScheduler,
} from './notchAnimation'

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

describe('easing', () => {
  it('pins both curves to the 0→1 unit interval', () => {
    for (const ease of [easeOutCubic, easeInCubic]) {
      expect(ease(0)).toBe(0)
      expect(ease(1)).toBe(1)
    }
  })

  it('starts fast and ends slow for the entrance', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
  })

  it('starts slow and ends fast for the exit', () => {
    expect(easeInCubic(0.5)).toBeLessThan(0.5)
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
