import { describe, it, expect } from 'vitest'
import {
  CONFETTI_MAX_DURATION_MS,
  CONFETTI_MIN_DURATION_MS,
  CONFETTI_PIECE_COUNT,
  CONFETTI_STAGGER_MS,
  CONFETTI_START_DELAY_MS,
  CONFETTI_TOTAL_MS,
  createConfettiPieces,
  type CreateConfettiOptions,
} from './confetti'
import { ENTER_MS } from './notchAnimation'
import { NOTCH_TIER_CONFETTI } from './notchRewardTiers'

const CARD_HEIGHT = 191

const options: CreateConfettiOptions = {
  seed: 'reward-merge-master',
  colors: NOTCH_TIER_CONFETTI.gold,
  origin: { x: 30, y: 111 },
  height: CARD_HEIGHT,
}

describe('createConfettiPieces', () => {
  it('throws the full burst by default', () => {
    expect(createConfettiPieces(options)).toHaveLength(CONFETTI_PIECE_COUNT)
  })

  it('gives the same seed the same burst, every time', () => {
    // The pattern is not information: two unlocks must not be distinguishable by their confetti, and
    // a screenshot of one card has to be reproducible. `Math.random()` would fail both.
    expect(createConfettiPieces(options)).toEqual(createConfettiPieces(options))
  })

  it('gives a different reward a different burst', () => {
    const other = createConfettiPieces({ ...options, seed: 'reward-first-commit' })
    expect(other).not.toEqual(createConfettiPieces(options))
  })

  it('launches every piece upwards, never flat or down', () => {
    // A piece that starts by falling reads as a rendering glitch rather than as a celebration.
    for (const piece of createConfettiPieces(options)) {
      expect(piece.apexY).toBeLessThan(0)
    }
  })

  it('sends every piece past the bottom edge, so nothing is left lying on the card', () => {
    for (const piece of createConfettiPieces(options)) {
      expect(piece.y + piece.fallY).toBeGreaterThan(CARD_HEIGHT)
    }
  })

  it('starts each piece within a few points of the medal it comes out of', () => {
    for (const piece of createConfettiPieces(options)) {
      expect(Math.abs(piece.x - options.origin.x)).toBeLessThanOrEqual(6)
      expect(Math.abs(piece.y - options.origin.y)).toBeLessThanOrEqual(5)
    }
  })

  it('throws pieces both ways, rather than a one-sided spray', () => {
    const drifts = createConfettiPieces(options).map((p) => p.driftX)
    expect(drifts.some((d) => d > 0)).toBe(true)
    expect(drifts.some((d) => d < 0)).toBe(true)
  })

  it('waits for the card to have landed before launching anything', () => {
    // The window is parked above its resting spot until the slide ends, so a burst thrown early
    // happens off the top of the screen.
    for (const piece of createConfettiPieces(options)) {
      expect(piece.delayMs).toBeGreaterThanOrEqual(CONFETTI_START_DELAY_MS)
      expect(piece.delayMs).toBeLessThanOrEqual(CONFETTI_START_DELAY_MS + CONFETTI_STAGGER_MS)
    }
  })

  it('staggers the launches instead of firing them on one frame', () => {
    const delays = new Set(createConfettiPieces(options).map((p) => p.delayMs))
    expect(delays.size).toBeGreaterThan(1)
  })

  it('keeps every flight time inside the declared range', () => {
    for (const piece of createConfettiPieces(options)) {
      expect(piece.durationMs).toBeGreaterThanOrEqual(CONFETTI_MIN_DURATION_MS)
      expect(piece.durationMs).toBeLessThanOrEqual(CONFETTI_MAX_DURATION_MS)
    }
  })

  it('cuts the paper from the palette it was given, using all of it', () => {
    const colors = new Set(createConfettiPieces(options).map((p) => p.color))
    expect([...colors].every((c) => NOTCH_TIER_CONFETTI.gold.includes(c))).toBe(true)
    expect(colors.size).toBe(NOTCH_TIER_CONFETTI.gold.length)
  })

  it('mixes round pieces in among the rectangles', () => {
    const pieces = createConfettiPieces(options)
    expect(pieces.some((p) => p.round)).toBe(true)
    expect(pieces.some((p) => !p.round)).toBe(true)
    // A round piece is a dot, so it has to be square before its corners are rounded off.
    for (const piece of pieces.filter((p) => p.round)) {
      expect(piece.height).toBe(piece.width)
    }
  })

  it('spins pieces both ways', () => {
    const spins = createConfettiPieces(options).map((p) => p.spinDeg)
    expect(spins.some((s) => s > 0)).toBe(true)
    expect(spins.some((s) => s < 0)).toBe(true)
  })

  it('honours a smaller burst', () => {
    expect(createConfettiPieces({ ...options, count: 6 })).toHaveLength(6)
  })

  it('returns nothing rather than throwing when asked for no burst at all', () => {
    expect(createConfettiPieces({ ...options, count: 0 })).toEqual([])
    expect(createConfettiPieces({ ...options, colors: [] })).toEqual([])
  })

  it('keys its ids to the array, so React can tell the pieces apart', () => {
    expect(createConfettiPieces({ ...options, count: 3 }).map((p) => p.id)).toEqual([0, 1, 2])
  })
})

describe('confetti timing', () => {
  it('starts exactly when the card stops sliding', () => {
    expect(CONFETTI_START_DELAY_MS).toBe(ENTER_MS)
  })

  it('reports a total the auto-dismiss has to outlast', () => {
    // A card dismissed before this is a celebration cut off mid-air — the figure exists so a caller
    // can check its display duration against it.
    expect(CONFETTI_TOTAL_MS).toBe(
      CONFETTI_START_DELAY_MS + CONFETTI_STAGGER_MS + CONFETTI_MAX_DURATION_MS
    )
    const slowest = Math.max(...createConfettiPieces(options).map((p) => p.delayMs + p.durationMs))
    expect(slowest).toBeLessThanOrEqual(CONFETTI_TOTAL_MS)
  })
})
