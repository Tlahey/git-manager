import { useCallback, useEffect, useRef, useState } from 'react'
import {
  animateValue,
  ENTER_MS,
  EXIT_FADE_AT,
  EXIT_MS,
  linear,
  SLIDE_DISTANCE,
  type FrameScheduler,
} from './notchAnimation'
import type { NotchHost } from './notchHost'

/**
 * The card's whole life: slide in from behind the menu bar, sit there, slide back up and close.
 *
 * Extracted from the popover component because it was the part that could not be tested at all —
 * every step of it went straight through Tauri IPC. Here it talks only to a {@link NotchHost}, so
 * the same sequence runs against a real window, a `<div>`, or a recording stub.
 *
 * Every native step is individually guarded. If `prepare` throws (a denied permission), or `show`
 * is slow, or the tween fails, the card must still end up visible at its resting spot — a
 * notification that silently never appears is the worst outcome available, and it has happened.
 */

export interface UseNotchPresenterOptions {
  host: NotchHost
  /** The surface's resting top edge, in the host's coordinate space. */
  restY: number
  /**
   * How far the surface travels, in the host's coordinate space.
   *
   * Pass the surface's **full height** and the slide alone does all the appearing and
   * disappearing: parked one of these above its resting spot the card is entirely off the top of
   * the screen, so it emerges from nothing and leaves to nothing without anything having to fade
   * it in or out. That is the whole point of the movement.
   *
   * Defaults to {@link SLIDE_DISTANCE}, a short nudge, which is all a host that cannot go
   * off-screen (the Storybook harness, where the "window" is a div on a page) can do.
   */
  slideDistance?: number
  /** `null` for "stays until dismissed" — no timer at all, rather than a very long one, so
   *  nothing can retire the card behind the user's back. */
  autoDismissMs: number | null
  /**
   * Runs after the exit animation and **before** the host is closed, awaited.
   *
   * That order is not cosmetic. On a real window `close()` destroys the webview this code is
   * running in, and anything still in flight goes with it — so a dismissal announced afterwards
   * simply never arrives. Its owner then believes the card is still up and holds every card behind
   * it forever. Announce first, then go.
   */
  onDismissed?: () => void | Promise<void>
  /**
   * Dismiss as soon as the surface loses focus, the way a native `NSPopover` does. Only the real
   * window wants this: in Storybook the "window" is a div on a page the user keeps clicking around
   * in, and every click would kill the card.
   */
  dismissOnBlur?: boolean
  scheduler?: FrameScheduler
}

export interface NotchPresenter {
  /** Drives the card's opacity — `false` both before the entrance and during the exit. */
  visible: boolean
  /** Whether the auto-dismiss countdown is currently suspended. */
  paused: boolean
  dismiss: () => void
  /** Suspends the countdown, keeping whatever time was left (hover to read a long title). */
  pauseAutoDismiss: () => void
  /** Resumes with the time that was left when it was paused. */
  resumeAutoDismiss: () => void
}

export function useNotchPresenter(options: UseNotchPresenterOptions): NotchPresenter {
  const [visible, setVisible] = useState(false)
  const [paused, setPaused] = useState(false)

  // Read through a ref so the entrance effect can run exactly once per mount without going stale
  // on a host or callback that is recreated every render.
  const latest = useRef(options)
  latest.current = options

  const dismissingRef = useRef(false)
  const slidInRef = useRef(false)
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const deadlineRef = useRef<number>()
  const remainingRef = useRef<number>()

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current)
    timerRef.current = undefined
    deadlineRef.current = undefined
  }, [])

  const dismiss = useCallback(async () => {
    if (dismissingRef.current) return
    dismissingRef.current = true
    clearTimer()

    const { host, restY, scheduler, onDismissed, slideDistance = SLIDE_DISTANCE } = latest.current
    // Only animate out if it ever animated in — a card dismissed before its entrance finished
    // would otherwise slide from a position it never reached.
    if (slidInRef.current) {
      // The fade is started from inside the tween rather than before it, and rather than off a
      // second timer: driven by the card's own travel it cannot desync from the movement, and it
      // stays deterministic under the injected scheduler the tests step by hand.
      let fading = false
      await animateValue({
        from: restY,
        to: restY - slideDistance,
        durationMs: EXIT_MS,
        ease: linear,
        onFrame: (y, progress) => {
          host.setY(y)
          if (fading || progress < EXIT_FADE_AT) return
          fading = true
          setVisible(false)
        },
        ...(scheduler ? { scheduler } : {}),
        isCancelled: () => cancelledRef.current,
      })
      // The tween's per-frame `setY` is fire-and-forget — deliberately, or the slide would run at
      // IPC speed instead of frame speed. The cost is that the last positions can still be in
      // flight when the tween resolves, and closing the surface right then tears it down while it
      // is visibly still travelling: the card vanishes before the slide finishes, which is exactly
      // what it must not do. This is the one point where waiting for a round trip buys something.
      try {
        await host.setY(restY - slideDistance)
      } catch (e) {
        console.warn('Notch: failed to settle the surface at the end of its slide:', e)
      }
    }
    // Whatever happened above — no entrance to reverse, or a tween cancelled before the card had
    // travelled far enough to start fading — the card must not be left showing.
    setVisible(false)
    // Announced before the surface is closed, and awaited — see `onDismissed`. Guarded on its own
    // so a failed announcement still lets the card go: an orphan surface stuck on screen is worse
    // than an owner that has to find out some other way.
    try {
      await onDismissed?.()
    } catch (e) {
      console.warn('Notch: failed to announce the dismissal:', e)
    }
    try {
      await host.close()
    } catch (e) {
      console.warn('Notch: failed to close the host surface:', e)
    }
  }, [clearTimer])

  const armTimer = useCallback(
    (ms: number) => {
      clearTimer()
      deadlineRef.current = Date.now() + ms
      remainingRef.current = ms
      timerRef.current = setTimeout(() => void dismiss(), ms)
    },
    [clearTimer, dismiss]
  )

  const pauseAutoDismiss = useCallback(() => {
    if (timerRef.current === undefined || deadlineRef.current === undefined) return
    remainingRef.current = Math.max(0, deadlineRef.current - Date.now())
    clearTimer()
    setPaused(true)
  }, [clearTimer])

  const resumeAutoDismiss = useCallback(() => {
    setPaused((wasPaused) => {
      if (wasPaused && remainingRef.current !== undefined) armTimer(remainingRef.current)
      return false
    })
  }, [armTimer])

  useEffect(() => {
    cancelledRef.current = false

    async function enter() {
      const { host, restY, scheduler, slideDistance = SLIDE_DISTANCE } = latest.current
      try {
        await host.prepare?.()
      } catch (e) {
        console.warn('Notch: host preparation failed, showing anyway:', e)
      }
      // The surface starts one slide-step above its resting spot, before the first paint, so
      // nothing flashes at the wrong place on the way in.
      try {
        await host.setY(restY - slideDistance)
      } catch (e) {
        console.warn('Notch: failed to park the surface above its resting spot:', e)
      }
      try {
        await host.show()
      } catch (e) {
        console.warn('Notch: failed to reveal the surface:', e)
      }
      // `dismissing` as well as `cancelled`: the entrance is several awaited native calls long,
      // and a dismissal can land in the middle of it (focus lost, or the queue dropping the card).
      // Without this check the entrance carries on afterwards and reveals a card that has already
      // been dismissed and closed — the exit, having found `slidIn` still false, has by then
      // decided there was nothing to animate away.
      if (cancelledRef.current || dismissingRef.current) return

      setVisible(true)
      slidInRef.current = true
      host.playSound?.()

      try {
        await animateValue({
          from: restY - slideDistance,
          to: restY,
          durationMs: ENTER_MS,
          ease: linear,
          onFrame: (y) => host.setY(y),
          ...(scheduler ? { scheduler } : {}),
          // A dismissal mid-slide-in stops the entrance where it stands rather than fighting the
          // exit for the same coordinate.
          isCancelled: () => cancelledRef.current || dismissingRef.current,
        })
      } catch (e) {
        console.warn('Notch: slide-in failed, snapping to the resting spot:', e)
        try {
          await host.setY(restY)
        } catch {
          // Nothing further to try; the card is visible, just possibly a few points high.
        }
      }
    }
    void enter()

    const { autoDismissMs, dismissOnBlur } = latest.current
    if (autoDismissMs !== null && autoDismissMs > 0) armTimer(autoDismissMs)

    const handleBlur = () => void dismiss()
    if (dismissOnBlur) window.addEventListener('blur', handleBlur)

    return () => {
      cancelledRef.current = true
      clearTimer()
      if (dismissOnBlur) window.removeEventListener('blur', handleBlur)
    }
    // Mount-only: the card is created for one model and torn down with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    visible,
    paused,
    dismiss: () => void dismiss(),
    pauseAutoDismiss,
    resumeAutoDismiss,
  }
}
