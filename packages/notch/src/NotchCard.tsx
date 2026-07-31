import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@git-manager/ui'
import {
  bandSlotMaxWidth,
  HALO_MARGIN,
  NOTCH_CARD_WIDTH,
  NOTCH_HOUSING_HALF_WIDTH,
  NOTCH_ROW,
  withRule,
} from './notchGeometry'
import { NOTCH_TONE_RGB } from './notchTones'
import type { NotchTone } from './types'

/** Named once, used by both the `@keyframes` block and the inline `animation` that runs it — so
 *  the two can't drift into a rule nothing references. */
const HALO_PULSE_KEYFRAMES = 'notch-halo-pulse'
/** One full breath (faint → bright → faint). Larger is slower. */
const HALO_PULSE_DURATION = '2s'

export interface NotchCardProps {
  tone: NotchTone
  /** Drives the fade. The presenter owns it — `false` before the entrance and during the exit. */
  visible: boolean
  /** Content for the left sliver of the reserved band. Capped so it can't run under the housing. */
  bandStart?: ReactNode
  /** Content for the right sliver — the close button, in practice. */
  bandEnd?: ReactNode
  children: ReactNode
  /** Clicking anywhere on the card. The action row's primary button is the same action made
   *  explicit and keyboard-reachable, which is why this stays a plain div rather than a
   *  `role="button"` wrapping other buttons. */
  onActivate?: () => void
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  haloMargin?: number
  cardWidth?: number
  housingHalfWidth?: number
  'data-testid'?: string
}

/**
 * The card's shell: the halo, the reserved notch band, and the black rounded rectangle everything
 * else is drawn inside.
 *
 * Knows nothing about notifications — it takes a tone and some children. What makes it worth its
 * own component is the top band: the card's top edge sits at the very top of the screen, so its
 * first 32 points are *behind the camera housing* on a notched Mac and physically cannot be read.
 * Every layout that goes in the notch has to respect that, and doing it once here is what keeps
 * the next kind of card from quietly putting a title where nobody can see it.
 */
export function NotchCard({
  tone,
  visible,
  bandStart,
  bandEnd,
  children,
  onActivate,
  onPointerEnter,
  onPointerLeave,
  haloMargin = HALO_MARGIN,
  cardWidth = NOTCH_CARD_WIDTH,
  housingHalfWidth = NOTCH_HOUSING_HALF_WIDTH,
  'data-testid': testId = 'notch-card',
}: NotchCardProps) {
  const toneRgb = NOTCH_TONE_RGB[tone]
  const inset = {
    top: haloMargin,
    left: haloMargin,
    right: haloMargin,
    bottom: haloMargin,
  }
  const slotStyle = { maxWidth: bandSlotMaxWidth(cardWidth, housingHalfWidth) }

  return (
    <div className="relative h-full w-full">
      {/* Scoped to this component rather than the shared tailwind config: one consumer, one
          keyframe. Animates the shadow itself (blur radius + alpha, no spread) rather than the
          element's opacity — a spread pushes a hard-edged band of solid colour out from the card,
          and swinging a whole layer's opacity reads as a blink. This breathes. */}
      <style>{`
        @keyframes ${HALO_PULSE_KEYFRAMES} {
          0%, 100% { box-shadow: 0 0 10px rgba(var(--notch-tone-rgb), 0.25); }
          50%      { box-shadow: 0 0 20px rgba(var(--notch-tone-rgb), 0.5); }
        }
      `}</style>

      {/* Halo: same rect as the card, behind it, glow bleeding into the transparent margin around
          it. A `box-shadow` (not a gradient) so it follows the card's own rounded shape exactly.
          The animation is declared inline rather than through Tailwind's `animate-[…]` arbitrary
          value: that utility only exists if Tailwind's content scanner finds the literal class
          string and emits a rule for it, which couples a hand-written keyframe sitting three lines
          above to the build pipeline for no benefit. Inline, it references the keyframe directly. */}
      <div
        aria-hidden="true"
        data-testid="notch-halo"
        className="absolute rounded-b-2xl transition-opacity duration-200"
        style={
          {
            ...inset,
            '--notch-tone-rgb': toneRgb,
            opacity: visible ? 1 : 0,
            animation: visible
              ? `${HALO_PULSE_KEYFRAMES} ${HALO_PULSE_DURATION} ease-in-out infinite`
              : undefined,
          } as CSSProperties
        }
      />

      <div
        data-testid={testId}
        onClick={onActivate}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        style={inset}
        className={cn(
          // Rounded on the bottom only, square on top: the top edge sits flush against (and partly
          // behind) the menu bar, so rounding it would leave a visible gap of bar showing through
          // the corners. Background is *fully* opaque black regardless of theme — this card reads
          // as an extension of the (always-dark) menu bar, not as a themed app surface.
          // Deliberately no `shadow-*` and no `backdrop-blur-*`: both paint into the transparent
          // margin around the card (a dark haze, and a frosted sample of the desktop) and stack
          // with the halo into something that reads as a pane of glass. The halo is the only thing
          // allowed to render outside the card's own rectangle.
          'absolute flex flex-col overflow-hidden rounded-b-2xl border border-white/10 bg-black transition-opacity duration-200 ease-out',
          onActivate && 'cursor-pointer',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* ── Row 0: the reserved notch band ──────────────────────────────────────────────────
            Only the two slivers either side of the camera housing hold anything. */}
        <div
          data-testid="notch-band"
          style={{ height: withRule(NOTCH_ROW.band) }}
          className="flex shrink-0 items-center justify-between border-b border-white/5 pl-3 pr-2"
        >
          <div style={slotStyle} className="min-w-0 truncate">
            {bandStart}
          </div>
          <div style={slotStyle} className="flex min-w-0 shrink-0 items-center justify-end">
            {bandEnd}
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
