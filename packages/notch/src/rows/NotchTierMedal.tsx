import { Trophy } from 'lucide-react'
import { NOTCH_REWARD_MEDAL_SIZE } from '../notchGeometry'
import { tierAlpha, tierColor } from '../notchRewardTiers'
import type { NotchRewardTier } from '../types'

export interface NotchTierMedalProps {
  tier: NotchRewardTier
  /** Diameter in points. Defaults to {@link NOTCH_REWARD_MEDAL_SIZE} — the figure the confetti's
   *  origin is derived from, so overriding it moves the medal without moving the burst. */
  size?: number
}

/**
 * The disc a reward card wears where the other cards wear an avatar.
 *
 * The same glyph at every tier, and only the colour changes: a trophy is what the user recognises,
 * and swapping in a different shape per tier would make four unrelated icons out of one ranked scale.
 * The lit-from-above gradient is what stops it reading as a flat coloured circle on a black card.
 *
 * Decorative, and marked as such — a medal cannot say "gold" to a screen reader. The tier belongs in
 * the card's own copy (the eyebrow, in practice), where it is a translated string rather than a hue.
 */
export function NotchTierMedal({ tier, size = NOTCH_REWARD_MEDAL_SIZE }: NotchTierMedalProps) {
  return (
    <span
      data-testid="notch-tier-medal"
      data-tier={tier}
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 24%, ${tierAlpha(tier, 0.5)} 0%, ${tierAlpha(
          tier,
          0.12
        )} 70%, rgba(0, 0, 0, 0) 100%)`,
        // `inset` ring plus an outward glow, in one property: a `ring-*` class can't take a computed
        // colour, and a second element for the glow would just be a `box-shadow` with extra nodes.
        boxShadow: `inset 0 0 0 1px ${tierAlpha(tier, 0.45)}, 0 0 14px ${tierAlpha(tier, 0.3)}`,
        color: tierColor(tier),
      }}
    >
      <Trophy style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={2.1} />
    </span>
  )
}
