import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNotchPresenter } from './useNotchPresenter'
import { createRecordingNotchHost, type NotchHost } from './notchHost'
import {
  ENTER_MS,
  EXIT_FADE_AT,
  EXIT_MS,
  SLIDE_DISTANCE,
  type FrameScheduler,
} from './notchAnimation'

/** A scheduler whose clock only moves when the test says so, for asserting mid-tween state. */
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

/**
 * Completes any tween in a single frame: the callback is invoked with a time far past the
 * duration, so `t` clamps to 1 and the animation resolves without a second request. Lifecycle
 * tests care about the *order* of host calls, not about intermediate positions.
 */
const instantScheduler: FrameScheduler = {
  now: () => 0,
  request: (callback) => callback(1_000_000),
}

const REST_Y = 100

function setup(overrides: Partial<Parameters<typeof useNotchPresenter>[0]> = {}) {
  const host = createRecordingNotchHost()
  const view = renderHook(() =>
    useNotchPresenter({
      host,
      restY: REST_Y,
      autoDismissMs: 5000,
      scheduler: instantScheduler,
      ...overrides,
    })
  )
  return { host, ...view }
}

/** Lets the entrance's awaited host calls settle. */
async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('entrance', () => {
  it('prepares the host, parks the surface a slide above rest, then reveals it', async () => {
    const { host } = setup()
    await flush()

    expect(host.calls.slice(0, 3)).toEqual(['prepare', 'setY', 'show'])
    expect(host.positions[0]).toBe(REST_Y - SLIDE_DISTANCE)
  })

  it('becomes visible and lands exactly on the resting spot', async () => {
    const { host, result } = setup()
    await flush()

    expect(result.current.visible).toBe(true)
    expect(host.positions.at(-1)).toBe(REST_Y)
  })

  it('chimes once the card is on screen', async () => {
    const { host } = setup()
    await flush()

    expect(host.calls).toContain('playSound')
  })

  it('still reveals the card when the native preparation throws', async () => {
    // A denied permission or a missing window handle must not leave the user with an invisible
    // notification — the failure mode this guard exists for.
    vi.spyOn(console, 'warn').mockImplementation(() => { })
    const host: NotchHost = {
      ...createRecordingNotchHost(),
      prepare: () => {
        throw new Error('no ns_window handle')
      },
    }
    const shown = vi.fn()
    const { result } = renderHook(() =>
      useNotchPresenter({
        host: { ...host, show: shown },
        restY: REST_Y,
        autoDismissMs: null,
        scheduler: instantScheduler,
      })
    )
    await flush()

    expect(shown).toHaveBeenCalled()
    expect(result.current.visible).toBe(true)
  })
})

describe('auto-dismiss', () => {
  it('closes the host once the delay elapses', async () => {
    const { host } = setup({ autoDismissMs: 5000 })
    await flush()
    expect(host.calls).not.toContain('close')

    await act(async () => {
      vi.advanceTimersByTime(5000)
    })

    expect(host.calls).toContain('close')
  })

  it('arms no timer at all when the user chose "until I close it"', async () => {
    const { host } = setup({ autoDismissMs: null })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(600_000)
    })

    expect(host.calls).not.toContain('close')
  })

  // The exit used to drop the opacity in the same breath as starting the slide. Over a 180ms
  // slide and a 200ms CSS fade the two cancelled out: the card was transparent before it had
  // visibly gone anywhere, so it read as being switched off rather than sliding away. Reported
  // from real use as "it just hides".
  it('keeps the card on screen while it slides, and fades it only on the way out', async () => {
    const scheduler = manualScheduler()
    const { result, host } = setup({ scheduler, autoDismissMs: null })
    // Let the entrance's awaited host calls settle so its tween is the one holding a frame.
    await flush()
    await flush()
    await flush()
    await act(async () => {
      scheduler.advance(ENTER_MS)
    })
    expect(result.current.visible).toBe(true)

    act(() => {
      result.current.dismiss()
    })

    // Early in the exit: already moving, and still on screen — this is the part that was missing.
    await act(async () => {
      scheduler.advance(EXIT_MS * (EXIT_FADE_AT / 2))
    })
    expect(result.current.visible).toBe(true)
    expect(host.positions.at(-1)).toBeLessThan(REST_Y)

    // Past the fade point, with slide left to run, so the fade plays *during* the movement.
    await act(async () => {
      scheduler.advance(EXIT_MS * EXIT_FADE_AT)
    })
    expect(result.current.visible).toBe(false)
  })

  it('hides a card dismissed before it ever slid in', async () => {
    // No entrance to reverse means no tween to hang the fade off — it must still not be left
    // showing.
    const scheduler = manualScheduler()
    const { result } = setup({ scheduler, autoDismissMs: null })

    act(() => {
      result.current.dismiss()
    })
    await flush()

    expect(result.current.visible).toBe(false)
  })

  // The real window passes its own full height here, which is what lets the movement alone do the
  // appearing and the disappearing: parked one height above rest the card is entirely off the top
  // of the screen. The short default nudge left it visible at both ends, so it read as being
  // switched on and off rather than arriving and leaving.
  it('travels the full distance it is given, at both ends', async () => {
    const travel = 300
    const { host } = setup({ slideDistance: travel, autoDismissMs: 1000 })
    await flush()

    // Parked a whole travel above rest before it is ever shown.
    expect(host.positions[0]).toBe(REST_Y - travel)
    expect(host.positions.at(-1)).toBe(REST_Y)

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(host.positions.at(-1)).toBe(REST_Y - travel)
  })

  it('slides back up before closing', async () => {
    const { host } = setup({ autoDismissMs: 1000 })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    const closeIndex = host.calls.indexOf('close')
    expect(host.positions.at(-1)).toBe(REST_Y - SLIDE_DISTANCE)
    expect(host.calls.lastIndexOf('setY')).toBeLessThan(closeIndex)
  })

  it('reports the dismissal to the caller', async () => {
    const onDismissed = vi.fn()
    setup({ autoDismissMs: 1000, onDismissed })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    expect(onDismissed).toHaveBeenCalledTimes(1)
  })

  it('reports it BEFORE closing the host, and waits for it', async () => {
    // The bug this pins, and it was a total one. On a real window `close()` destroys the webview
    // the announcement travels out of, so one made afterwards never arrives. The owner then goes on
    // believing the card is up and holds every later card behind a window that no longer exists —
    // the queue never advances again for the rest of the session.
    const host = createRecordingNotchHost()
    let released: (() => void) | undefined
    const onDismissed = () =>
      new Promise<void>((resolve) => {
        host.calls.push('announce:start')
        released = () => {
          host.calls.push('announce:done')
          resolve()
        }
      })

    const view = renderHook(() =>
      useNotchPresenter({
        host,
        restY: REST_Y,
        autoDismissMs: 1000,
        scheduler: instantScheduler,
        onDismissed,
      })
    )
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })

    // Still in flight — so the close genuinely waits on it rather than racing it.
    expect(host.calls).toContain('announce:start')
    expect(host.calls).not.toContain('close')

    await act(async () => {
      released?.()
      await Promise.resolve()
    })

    expect(host.calls.indexOf('announce:done')).toBeLessThan(host.calls.indexOf('close'))
    view.unmount()
  })

  it('closes anyway when the announcement fails', async () => {
    // A surface stuck on screen forever is worse than an owner that has to find out some other way.
    const onDismissed = vi.fn().mockRejectedValue(new Error('the main window is gone'))
    vi.spyOn(console, 'warn').mockImplementation(() => { })
    const { host } = setup({ autoDismissMs: 1000, onDismissed })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })

    expect(host.calls).toContain('close')
  })
})

describe('pause / resume', () => {
  it('keeps the card up while the countdown is suspended', async () => {
    const { host, result } = setup({ autoDismissMs: 5000 })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(2000)
      result.current.pauseAutoDismiss()
    })
    expect(result.current.paused).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })
    expect(host.calls).not.toContain('close')
  })

  it('resumes with the time that was left, not a fresh full delay', async () => {
    const { host, result } = setup({ autoDismissMs: 5000 })
    await flush()

    await act(async () => {
      vi.advanceTimersByTime(4000)
      result.current.pauseAutoDismiss()
    })
    await act(async () => {
      result.current.resumeAutoDismiss()
    })
    expect(result.current.paused).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(999)
    })
    expect(host.calls).not.toContain('close')

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(host.calls).toContain('close')
  })

  it('ignores a pause when there is no countdown to suspend', async () => {
    const { result } = setup({ autoDismissMs: null })
    await flush()

    await act(async () => {
      result.current.pauseAutoDismiss()
    })

    expect(result.current.paused).toBe(false)
  })
})

describe('dismiss', () => {
  it('closes the host exactly once however many times it is called', async () => {
    const { host, result } = setup({ autoDismissMs: null })
    await flush()

    await act(async () => {
      result.current.dismiss()
      result.current.dismiss()
      result.current.dismiss()
    })

    expect(host.calls.filter((c) => c === 'close')).toHaveLength(1)
  })

  it('cancels a pending auto-dismiss rather than closing a second time', async () => {
    const { host, result } = setup({ autoDismissMs: 3000 })
    await flush()

    await act(async () => {
      result.current.dismiss()
    })
    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })

    expect(host.calls.filter((c) => c === 'close')).toHaveLength(1)
  })
})

// A card does NOT dismiss when focus leaves it. It used to, modelled on a native NSPopover, and
// that is wrong for a notification: clicking anywhere else on screen — the editor, a browser, the
// app's own window — made it vanish before it had been read. It leaves when its timer runs out, or
// when the user closes it.
describe('focus', () => {
  it('stays put when the surface loses focus', async () => {
    const { host } = setup({ autoDismissMs: null })
    await flush()

    await act(async () => {
      window.dispatchEvent(new Event('blur'))
    })

    expect(host.calls).not.toContain('close')
  })
})
