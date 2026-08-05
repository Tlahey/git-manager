/**
 * The confetti burst, as data — where every piece starts, where it flies, and when.
 *
 * A pure generator rather than a canvas loop, for two reasons that both come from where this runs.
 * The card lives in its own `WebviewWindow` that exists for a few seconds; a `requestAnimationFrame`
 * loop painting 28 sprites there costs a live JS timer for the whole life of a notification that the
 * user is meant to be able to ignore, whereas positions computed once and handed to CSS animations
 * are composited off the main thread and stop costing anything the moment they finish. And a
 * generator can be *asserted*: the piece a seed produces is a value, so "the burst stays inside the
 * card" and "the same reward looks the same twice" are tests rather than opinions.
 *
 * Seeded on purpose. `Math.random()` would make every screenshot of the same card different, and the
 * pattern is not information — nobody should be able to tell two unlocks apart by their confetti.
 * The seed is the model's id, so one achievement gets one burst, replayable.
 */

import { ENTER_MS } from './notchAnimation'

/** How many pieces a burst throws. Enough to read as a celebration on a 440×180 card, few enough
 *  that none of them lands on a word for long. */
export const CONFETTI_PIECE_COUNT = 28

/**
 * When the first piece launches, relative to the card being mounted.
 *
 * {@link ENTER_MS} exactly: the card slides down for that long, and a burst thrown while it is still
 * travelling happens somewhere the user is not looking yet — off the top of the screen, in the worst
 * case, since the window is parked above its resting spot until the slide ends.
 */
export const CONFETTI_START_DELAY_MS = ENTER_MS

/** How far apart the launches are spread. A single frame for all 28 reads as one shape popping in;
 *  a couple of hundred milliseconds reads as a burst. */
export const CONFETTI_STAGGER_MS = 220

/** A piece's flight time. The spread is what stops the burst from landing as one block. */
export const CONFETTI_MIN_DURATION_MS = 900
export const CONFETTI_MAX_DURATION_MS = 1600

/** How long the whole thing takes, worst case — what a caller waits out before it can stop
 *  rendering the layer at all. */
export const CONFETTI_TOTAL_MS =
  CONFETTI_START_DELAY_MS + CONFETTI_STAGGER_MS + CONFETTI_MAX_DURATION_MS

/** One piece of paper, in card points. `x`/`y` place it; the rest describe its flight from there. */
export interface ConfettiPiece {
  /** Stable within a burst — the React key, and nothing else. */
  id: number
  x: number
  y: number
  width: number
  height: number
  color: string
  /** Round pieces are the small dots mixed in among the rectangles. */
  round: boolean
  /** Signed horizontal travel over the whole flight. Constant speed: nothing slows a scrap of paper
   *  down sideways in the ~1.5 s it is on screen. */
  driftX: number
  /** Top of the arc, relative to `y`. Negative — up the screen. */
  apexY: number
  /** Where it ends up, relative to `y`. Always past the bottom edge, so no piece is left lying on
   *  the card when the animation stops. */
  fallY: number
  /** Total rotation over the flight, signed. */
  spinDeg: number
  delayMs: number
  durationMs: number
}

export interface CreateConfettiOptions {
  /** Anything stable per card — the model's id, in practice. */
  seed: string
  /** The tier's palette (see `NOTCH_TIER_CONFETTI`). Cycled through, brightest first. */
  colors: string[]
  /** Where the burst comes from — the medal, in practice. */
  origin: { x: number; y: number }
  /**
   * The card's height, in points: how far a piece has to fall to be gone.
   *
   * There is deliberately no `width`. Pieces are *clipped* by the card rather than steered away from
   * its edges — steering them would flatten the fountain into a fan, and the pieces that leave
   * sideways are what makes it look like it was thrown rather than drawn.
   */
  height: number
  count?: number
}

/** FNV-1a over the seed string — a spread of bits from an id, nothing cryptographic. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: one line of state, good enough for paper. */
function mulberry32(state: number): () => number {
  let a = state
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Lays out one burst.
 *
 * Every piece is launched from the same point at a random angle in the upper half — a fountain, the
 * way a party popper actually goes off — then falls past the bottom edge. The arc is described
 * rather than simulated: a start, an apex and an end, which is exactly the three keyframes CSS needs
 * and, with an ease-out into the apex and an ease-in out of it, is indistinguishable from gravity
 * over the second and a half anyone is watching.
 */
export function createConfettiPieces(options: CreateConfettiOptions): ConfettiPiece[] {
  const { seed, colors, origin, height, count = CONFETTI_PIECE_COUNT } = options
  if (count <= 0 || colors.length === 0) return []

  const random = mulberry32(hashSeed(seed))
  const between = (min: number, max: number) => min + random() * (max - min)

  return Array.from({ length: count }, (_, id) => {
    // Straight up is 90°; the spread stops 10° short of horizontal at either end, because a piece
    // launched flat never rises and reads as a glitch rather than as confetti.
    const angle = between(Math.PI * 0.06, Math.PI * 0.94)
    const speed = between(55, 170)
    const round = random() < 0.25
    const pieceWidth = between(3, 7)

    return {
      id,
      // Not a single pixel: a real popper has a mouth, and pieces leaving from one point look like
      // they are being extruded rather than thrown.
      x: origin.x + between(-6, 6),
      y: origin.y + between(-5, 5),
      width: pieceWidth,
      height: round ? pieceWidth : pieceWidth * between(1.4, 2.6),
      color: colors[id % colors.length],
      round,
      driftX: Math.cos(angle) * speed * 1.25,
      apexY: -Math.abs(Math.sin(angle)) * speed * 0.7,
      // Past the bottom of the field, however far down it started.
      fallY: height - origin.y + between(24, 96),
      spinDeg: between(200, 900) * (random() < 0.5 ? -1 : 1),
      delayMs: Math.round(CONFETTI_START_DELAY_MS + random() * CONFETTI_STAGGER_MS),
      durationMs: Math.round(between(CONFETTI_MIN_DURATION_MS, CONFETTI_MAX_DURATION_MS)),
    }
  })
}
