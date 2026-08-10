/**
 * The colours the trophy board is made of, keyed by the fixed sets they belong to.
 *
 * They live in a config file rather than inline in the JSX for the reason `CLAUDE.md` gives: a
 * lookup table over a closed set of values is data, and reading it as data makes a missing case
 * visible. Every entry is a Tailwind class string, so the literal hexes have to stay spelled out —
 * `text-[#cd7f32]` is one token to the compiler and cannot be built from a variable.
 *
 * Difficulty labels are stored as i18n *keys*: a module-level map cannot call `t()`.
 */

import type { AchievementTier } from '../../../lib/rewards/types'

/** The glow around the rank card — one entry per level, and one that overrides them all. */
export const RANK_GLOW: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'shadow-slate-500/10 border-slate-500/20 text-slate-400',
  2: 'shadow-[#cd7f32]/10 border-[#cd7f32]/20 text-[#cd7f32]',
  3: 'shadow-[#c0c0c0]/15 border-[#c0c0c0]/20 text-[#e2e8f0]',
  4: 'shadow-[#ffd700]/20 border-[#ffd700]/30 text-[#ffd700]',
  5: 'shadow-[#ff007f]/30 border-[#ff007f]/30 text-[#ff007f] animate-pulse',
}

/** The platinum trophy outranks the point-based levels, so it has its own glow. */
export const PLATINUM_RANK_GLOW = 'shadow-cyan-500/20 border-cyan-500/30 text-cyan-400'

export function rankGlowFor(level: number, isPlatinumUnlocked: boolean): string {
  if (isPlatinumUnlocked) return PLATINUM_RANK_GLOW
  return RANK_GLOW[level as 1 | 2 | 3 | 4 | 5]
}

/** The badge behind an achievement's trophy icon, by tier. */
export const TROPHY_COLORS: Record<AchievementTier, string> = {
  bronze: 'text-[#cd7f32] bg-[#cd7f32]/10 border-[#cd7f32]/20',
  silver: 'text-[#e2e8f0] bg-[#c0c0c0]/10 border-[#c0c0c0]/20',
  gold: 'text-[#ffd700] bg-[#ffd700]/10 border-[#ffd700]/20',
  platinum: 'text-[#00ffff] bg-[#00ffff]/10 border-[#00ffff]/20',
}

/** The tier counters across the top of the cabinet, in the order they are shown. */
export const TROPHY_TIERS: { type: AchievementTier; labelKey: string; iconClassName: string }[] = [
  {
    type: 'bronze',
    labelKey: 'rewards.bronze',
    iconClassName: 'text-[#cd7f32] drop-shadow-[0_2px_4px_rgba(205,127,50,0.3)]',
  },
  {
    type: 'silver',
    labelKey: 'rewards.silver',
    iconClassName: 'text-[#e2e8f0] drop-shadow-[0_2px_4px_rgba(192,192,192,0.3)]',
  },
  {
    type: 'gold',
    labelKey: 'rewards.gold',
    iconClassName: 'text-[#ffd700] drop-shadow-[0_2px_4px_rgba(255,215,0,0.3)]',
  },
  {
    type: 'platinum',
    labelKey: 'rewards.platinum',
    iconClassName: 'text-[#00ffff] drop-shadow-[0_2px_4px_rgba(0,255,255,0.3)]',
  },
]

/** The three sections the challenge list is grouped into, in order. */
export const DIFFICULTY_GROUPS = [
  { id: 'beginner', labelKey: 'rewards.levelBeginner' },
  { id: 'intermediate', labelKey: 'rewards.levelIntermediate' },
  { id: 'expert', labelKey: 'rewards.levelExpert' },
] as const

/** All three groups look the same today; the class is named so a future difference has a home. */
export const DIFFICULTY_GROUP_CLASS = 'text-foreground border-border bg-card/30'
