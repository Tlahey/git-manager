/**
 * The card's slide, as a plain number animation.
 *
 * The real popover moves the *OS window* rather than transforming its content, which is what makes
 * it read as a native banner emerging from behind the menu bar. That means the animation can't be
 * a CSS transition — it's a `setPosition` call per frame. Keeping the tween itself free of any
 * window API is what lets the same code drive a Tauri window in the app, a `top:` style in
 * Storybook, and a recorded array of values in a test.
 */

/**
 * How far the card travels while sliding in or out.
 *
 * Far enough that the movement is the thing you notice, rather than a hint of one. The card slides
 * out from behind the menu bar and back up under it, so this is travel the eye can follow, not
 * distance it needs to cover to be hidden — the fade is what hides it.
 */
export const SLIDE_DISTANCE = 40
export const ENTER_MS = 420
export const EXIT_MS = 320

/**
 * How far into the exit the card starts to fade, as a fraction of {@link EXIT_MS}.
 *
 * The fade deliberately *lags* the movement. Dropping the opacity the moment the card started
 * moving meant the two cancelled each other out: over a 180ms slide and a 200ms fade it was
 * already transparent before it had visibly gone anywhere, so it read as being switched off rather
 * than leaving. Letting it travel first, then fade on the way out, is what makes the exit an exit.
 *
 * Chosen so the fade *finishes* about when the slide does — at 0.35 of 320ms the 200ms CSS
 * transition lands at ~312ms — rather than being cut off mid-way by the surface closing.
 */
export const EXIT_FADE_AT = 0.35

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

export function easeInCubic(t: number): number {
  return t ** 3
}

/**
 * The clock and frame source, injected so tests can step time deterministically instead of racing
 * `requestAnimationFrame` (which, in jsdom, keeps firing callbacks across test boundaries within a
 * file if you let it own the queue).
 */
export interface FrameScheduler {
  now(): number
  request(callback: (now: number) => void): void
}

export const rafScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => {
    requestAnimationFrame(callback)
  },
}

export interface AnimateValueOptions {
  from: number
  to: number
  durationMs: number
  ease: (t: number) => number
  /** Called once per frame with the current value, and with the tween's raw progress (0→1, before
   *  easing). Its return value is ignored — a `setPosition` promise is deliberately not awaited, or
   *  the tween would run at IPC speed instead of frame speed.
   *
   *  Progress is passed because *time* is what a caller coordinating a second effect actually
   *  wants: with an accelerating ease the card has covered almost none of its distance for most of
   *  the slide, so "a third of the way there" and "a third of the way through" are wildly
   *  different moments. */
  onFrame: (value: number, progress: number) => unknown
  scheduler?: FrameScheduler
  /** Checked before every frame; when it returns `true` the tween stops where it is and resolves.
   *  The escape hatch for an unmount mid-slide. */
  isCancelled?: () => boolean
}

/**
 * Runs an eased tween from `from` to `to`, resolving when it lands (or is cancelled).
 *
 * Always emits the final value exactly — a tween that stops one frame short leaves the card a
 * pixel or two above its resting spot, which is visible against the menu bar's edge.
 */
export function animateValue(options: AnimateValueOptions): Promise<void> {
  const { from, to, durationMs, ease, onFrame, scheduler = rafScheduler, isCancelled } = options

  if (durationMs <= 0) {
    onFrame(to, 1)
    return Promise.resolve()
  }

  const start = scheduler.now()
  return new Promise((resolve) => {
    function step(now: number) {
      if (isCancelled?.()) {
        resolve()
        return
      }
      const t = Math.min(1, (now - start) / durationMs)
      onFrame(from + (to - from) * ease(t), t)
      if (t < 1) scheduler.request(step)
      else resolve()
    }
    scheduler.request(step)
  })
}
