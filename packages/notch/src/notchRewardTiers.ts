/**
 * What each reward tier looks like: the medal's colour, and the paper its confetti is cut from.
 *
 * Same storage rule as `notchTones.ts` — bare `r, g, b` triples, so a keyframe can vary the *alpha*
 * of one shared colour (`rgba(var(--notch-tier-rgb), …)`), which a hex value cannot be given from
 * inside a keyframe. Fixed values rather than theme tokens, for the same reason too: the card reads
 * as an extension of the (always dark) menu bar, whatever theme the user picked.
 *
 * The four hues are the consuming app's own trophy colours (git-manager's rewards tab), with two
 * adjustments the black card forces: silver is that palette's *icon* value rather than its border
 * one (`#c0c0c0` on pure black reads as dirty grey), and platinum is softened off pure `#00ffff`,
 * which at this size vibrates. A gold trophy still looks gold, which is the part that had to
 * survive the move onto the card.
 */

import type { NotchRewardTier } from './types'

export const NOTCH_TIER_RGB: Record<NotchRewardTier, string> = {
  bronze: '205, 127, 50', // #cd7f32
  silver: '226, 232, 240', // #e2e8f0
  gold: '255, 215, 0', // #ffd700
  platinum: '103, 232, 249', // cyan-300
}

/** `rgb(…)` for a tier, for anything that needs a plain opaque colour (the medal's glyph). */
export function tierColor(tier: NotchRewardTier): string {
  return `rgb(${NOTCH_TIER_RGB[tier]})`
}

/** `rgba(…)` for a tier at a given alpha — the medal's ring, its gradient, its glow. */
export function tierAlpha(tier: NotchRewardTier, alpha: number): string {
  return `rgba(${NOTCH_TIER_RGB[tier]}, ${alpha})`
}

/**
 * The confetti palette per tier, brightest first.
 *
 * Never one colour: a burst in a single hue reads as a spill rather than as a celebration. Each
 * palette is the tier's own colour, two neighbours of it, and white — which is what keeps a bronze
 * burst recognisably bronze without turning it into a shower of identical brown squares.
 */
export const NOTCH_TIER_CONFETTI: Record<NotchRewardTier, string[]> = {
  bronze: ['#cd7f32', '#f0b27a', '#ffd9a0', '#ffffff'],
  silver: ['#e2e8f0', '#c7d2e0', '#a8b3c4', '#ffffff'],
  gold: ['#ffd700', '#ffb347', '#fff3b0', '#ffffff'],
  platinum: ['#67e8f9', '#a5f3fc', '#c4b5fd', '#ffffff'],
}
