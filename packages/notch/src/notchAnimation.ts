/**
 * The card's slide, as a plain number animation.
 *
 * Deliberately a tween over numbers rather than a CSS transition, because what the numbers *mean*
 * is the host's business, not this module's: in the app they become a transform on the element the
 * card is drawn in, in Storybook a `top:` style, and in a test a recorded array of values. Keeping
 * the tween free of any window or DOM API is what lets one sequence drive all three.
 */

/**
 * How far the card travels, when the host does not say.
 *
 * Only a nudge, and only a fallback: a host that cannot hide the card by moving it — the Storybook
 * harness, where the "window" is a div on a page — has nothing better to do. The real window
 * passes its own full height instead (`slideDistance`), which is what lets the movement alone do
 * the appearing and the disappearing, with the window's bounds clipping the card out of sight at
 * both ends.
 */
export const SLIDE_DISTANCE = 40
export const ENTER_MS = 300
export const EXIT_MS = 300

/**
 * How long the card's *contents* take to fade.
 *
 * The shell — the black rectangle and its halo — does not fade at all: it slides, and that is the
 * whole of its animation. Only what is drawn inside it fades, which is what keeps the movement
 * legible. An earlier version faded the shell too, and the two cancelled each other out: the card
 * went transparent before it had visibly gone anywhere, so a real slide read as the card simply
 * being switched off.
 */
export const CONTENT_FADE_MS = 200

/**
 * How far into the exit the contents start to fade, as a fraction of {@link EXIT_MS}.
 *
 * Late on purpose: the card should be visibly leaving before it starts emptying, or the fade reads
 * as the card being switched off rather than sliding away. It does not have to *finish* before the
 * card goes — what actually hides the card is the window clipping it once it has travelled its own
 * height, so a fade still in progress at that point is simply never seen.
 */
export const EXIT_FADE_AT = 0.6

/**
 * Constant speed, and the only curve the card uses.
 *
 * An accelerating exit was the reason the card looked like it vanished mid-slide: at 60 % of the
 * duration a cubic ease-in has covered barely 21 % of the distance, so the card sat almost still
 * for most of the animation and then bolted. Travelled at a constant rate, the time elapsed and
 * the ground covered are the same number, which is what makes the movement readable — and what
 * lets the contents' fade be timed against the slide at all.
 */
export function linear(t: number): number {
  return t
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
