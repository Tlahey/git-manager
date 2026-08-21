import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@git-manager/ui'
import { CONTENT_FADE_MS } from './notchAnimation'
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
  /**
   * Drives the fade of the card's *contents* — the shell itself never fades, it only slides.
   *
   * The presenter owns it: `false` before the entrance, and again once the exit slide is far
   * enough along that the fade will finish as the card leaves.
   */
  visible: boolean
  /**
   * Overrides the halo's colour, as a bare `r, g, b` triple.
   *
   * For the one card whose accent is not its tone: a reward glows in its medal's colour, and "gold"
   * is not something the seven tones can say. Everything else leaves this alone and gets
   * {@link NOTCH_TONE_RGB}.
   */
  haloRgb?: string
  /** Content for the left sliver of the reserved band. Capped so it can't run under the housing. */
  bandStart?: ReactNode
  /** Content for the right sliver — the close button, in practice. */
  bandEnd?: ReactNode
  /**
   * Painted inside the shell, behind every row and clipped by the shell's own rounded rectangle —
   * the reward card's confetti, and nothing else so far.
   *
   * Behind the rows rather than over them: white text on black is the one thing on this card that
   * has to stay readable, and paper flying across a title is how a celebration turns into a
   * legibility bug. Clipped rather than free: see `NotchConfetti` for why the burst cannot leave the
   * card.
   */
  backdrop?: ReactNode
  children: ReactNode
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  haloMargin?: number
  cardWidth?: number
  housingHalfWidth?: number
  /** Height of the reserved band, in points. Defaults to {@link NOTCH_ROW}'s `band` (the figure
   *  every notched Mac happened to report as of writing) — pass the real per-machine
   *  `NSScreen.safeAreaInsets.top` when the caller has one. */
  bandHeight?: number
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
  haloRgb,
  bandStart,
  bandEnd,
  backdrop,
  children,
  onPointerEnter,
  onPointerLeave,
  haloMargin = HALO_MARGIN,
  cardWidth = NOTCH_CARD_WIDTH,
  housingHalfWidth = NOTCH_HOUSING_HALF_WIDTH,
  bandHeight = NOTCH_ROW.band,
  'data-testid': testId = 'notch-card',
}: NotchCardProps) {
  const toneRgb = haloRgb ?? NOTCH_TONE_RGB[tone]
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
        className="absolute rounded-b-2xl"
        style={
          {
            ...inset,
            '--notch-tone-rgb': toneRgb,
            // No fade: the halo belongs to the shell, and the shell's entire animation is the
            // slide. It travels with the card and glows the whole way.
            animation: `${HALO_PULSE_KEYFRAMES} ${HALO_PULSE_DURATION} ease-in-out infinite`,
          } as CSSProperties
        }
      />

      <div
        data-testid={testId}
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
          // No opacity of its own: the shell slides, and that is all it does. Fading it as well
          // used to cancel the movement out — see `CONTENT_FADE_MS`.
          // Not clickable: only the close button and the action row's explicit buttons (including
          // the primary "activate" action) respond to a click — see issue #413. A plain click on
          // the body does nothing, unlike a native macOS notification banner.
          'absolute flex flex-col overflow-hidden rounded-b-2xl border border-white/10 bg-black'
        )}
      >
        {/* Before the content in document order, so it stays behind it without a z-index. Outside
            the fading wrapper below for the same reason the halo is outside it: the celebration
            belongs to the shell, times itself against the card's arrival, and fades on its own. */}
        {backdrop}

        {/* Everything drawn *inside* the shell fades as one, so the card arrives and leaves as a
            solid object with its contents resolving in and out of it — rather than the whole
            thing dissolving, which is indistinguishable from it never having moved. */}
        <div
          data-testid="notch-content"
          className="flex min-h-0 flex-1 flex-col"
          style={{
            opacity: visible ? 1 : 0,
            transition: `opacity ${CONTENT_FADE_MS}ms ease-out`,
          }}
        >
          {/* ── Row 0: the reserved notch band ────────────────────────────────────────────────
              Only the two slivers either side of the camera housing hold anything. */}
          <div
            data-testid="notch-band"
            style={{ height: withRule(bandHeight) }}
            className="flex shrink-0 items-center justify-between border-b border-white/5 pr-2 pl-3"
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
    </div>
  )
}
