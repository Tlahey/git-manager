import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { createConfettiPieces, type ConfettiPiece } from './confetti'
import { NOTCH_CARD_WIDTH, rewardConfettiOrigin } from './notchGeometry'
import { NOTCH_TIER_CONFETTI } from './notchRewardTiers'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import type { NotchRewardTier } from './types'

/**
 * The celebration layer: one burst of paper, thrown from the medal, clipped by the card.
 *
 * **The confetti stays inside the card, and that is a constraint rather than a preference.** The
 * OS window the card lives in is the card inflated by `HALO_MARGIN` (26 pt) and nothing more, so
 * pieces have nowhere else to go — and growing the window so they could spill onto the wallpaper
 * would put a much larger transparent, always-on-top rectangle over the menu bar, swallowing the
 * clicks that land in it. A celebration that eats a click on the Apple menu is not a celebration.
 * So the burst is composed for a 440 × ~190 box: launched low, from behind the medal, with pieces
 * leaving through the edges rather than settling.
 *
 * Everything moves through CSS animations driven by per-piece custom properties. No
 * `requestAnimationFrame`, no canvas: this window is alive for a few seconds and the animation is
 * meant to cost nothing once it is done — with `fill-mode: both` every piece parks below the card's
 * bottom edge, clipped and invisible, and no timer is left running behind it.
 */

/** Named once each, shared by the `@keyframes` blocks and the classes that run them. */
const DRIFT = 'notch-confetti-drift'
const RISE = 'notch-confetti-rise'
const SPIN = 'notch-confetti-spin'

export interface NotchConfettiProps {
  tier: NotchRewardTier
  /** Stable per card — the model's id, so one unlock has one burst however often it is re-rendered. */
  seed: string
  /** The card's height in points: how far a piece has to fall to be out of sight. */
  height: number
  /** The card's width, for the layer's own box. */
  width?: number
  /** Where the burst comes from. Defaults to the medal's centre for a default-height band. */
  origin?: { x: number; y: number }
  count?: number
  /**
   * Overrides the system's reduced-motion preference — `true` renders nothing, `false` celebrates
   * regardless. Omit to consult `prefers-reduced-motion`, which is what the app does; the story
   * passes it explicitly so the degraded card can be reviewed on a machine that isn't set that way.
   */
  reducedMotion?: boolean
}

export function NotchConfetti({
  tier,
  seed,
  height,
  width = NOTCH_CARD_WIDTH,
  origin,
  count,
  reducedMotion,
}: NotchConfettiProps) {
  const systemReducedMotion = usePrefersReducedMotion()
  const reduced = reducedMotion ?? systemReducedMotion

  // Memoised on the origin's *coordinates* rather than on the object: the caller builds a fresh one
  // every render (`rewardConfettiOrigin(bandHeight)`), and a burst that is recomputed whenever the
  // presenter changes a piece of its own state is a burst that could restart mid-flight.
  const { x: originX, y: originY } = origin ?? rewardConfettiOrigin()
  const pieces = useMemo(
    () =>
      createConfettiPieces({
        seed,
        colors: NOTCH_TIER_CONFETTI[tier],
        origin: { x: originX, y: originY },
        height,
        ...(count !== undefined ? { count } : {}),
      }),
    [seed, tier, originX, originY, height, count]
  )

  // Nothing at all, rather than a static sprinkle: pieces frozen mid-air read as debris on the card,
  // and "reduce motion" is not a request for a quieter animation. The card still celebrates — a
  // medal, a tier-coloured halo, and an eyebrow that says what was unlocked.
  if (reduced) return null

  return (
    <div
      data-testid="notch-confetti"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ width, height }}
    >
      {/* Scoped to this component, like the halo's pulse in `NotchCard`: one consumer, three
          keyframes. The per-keyframe `animation-timing-function` in `${RISE}` is what makes the arc
          look like gravity — ease-out on the way up to the apex, ease-in on the way down out of it.
          One curve across the whole flight cannot express that, and a linear one reads as a piece of
          paper on a wire. */}
      <style>{`
        @keyframes ${DRIFT} {
          0%   { transform: translateX(0); opacity: 0; }
          8%   { opacity: 1; }
          78%  { opacity: 1; }
          100% { transform: translateX(var(--nc-drift)); opacity: 0; }
        }
        @keyframes ${RISE} {
          0%   { transform: translateY(0);
                 animation-timing-function: cubic-bezier(0.16, 0.72, 0.4, 1); }
          38%  { transform: translateY(var(--nc-apex));
                 animation-timing-function: cubic-bezier(0.5, 0.05, 0.9, 0.6); }
          100% { transform: translateY(var(--nc-fall)); }
        }
        @keyframes ${SPIN} {
          from { transform: rotate3d(1, 1, 0.2, 0deg); }
          to   { transform: rotate3d(1, 1, 0.2, var(--nc-spin)); }
        }
        .${DRIFT} { animation: ${DRIFT} var(--nc-duration) linear var(--nc-delay) both; }
        .${RISE}  { animation: ${RISE} var(--nc-duration) var(--nc-delay) both; }
        .${SPIN}  { animation: ${SPIN} var(--nc-duration) linear var(--nc-delay) both; }
      `}</style>

      {pieces.map((piece) => (
        <ConfettiSprite key={piece.id} piece={piece} />
      ))}
    </div>
  )
}

/**
 * One piece, as three nested elements — and it has to be three.
 *
 * A single element cannot hold a horizontal drift, a vertical arc and a tumble at once: all three
 * are `transform`, and the last declaration would win. So the drift owns the outer element (and the
 * fade, which belongs with it), the arc owns the middle one, and the paper itself tumbles.
 */
function ConfettiSprite({ piece }: { piece: ConfettiPiece }) {
  return (
    <span
      data-testid="notch-confetti-piece"
      className={`absolute ${DRIFT}`}
      style={
        {
          // Centred on its launch point rather than hung from its top-left corner, so the fountain
          // comes out of the medal's middle.
          left: piece.x - piece.width / 2,
          top: piece.y - piece.height / 2,
          '--nc-drift': `${piece.driftX.toFixed(1)}px`,
          '--nc-apex': `${piece.apexY.toFixed(1)}px`,
          '--nc-fall': `${piece.fallY.toFixed(1)}px`,
          '--nc-spin': `${Math.round(piece.spinDeg)}deg`,
          '--nc-duration': `${piece.durationMs}ms`,
          '--nc-delay': `${piece.delayMs}ms`,
          willChange: 'transform, opacity',
        } as CSSProperties
      }
    >
      <span className={`block ${RISE}`}>
        <span
          className={`block ${SPIN}`}
          style={{
            width: piece.width,
            height: piece.height,
            backgroundColor: piece.color,
            borderRadius: piece.round ? '50%' : 1,
          }}
        />
      </span>
    </span>
  )
}
