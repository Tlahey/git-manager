import { ChevronDown, ChevronUp, Equal, type LucideIcon } from 'lucide-react'
import type { BoardCardPriority } from '@git-manager/git-types'

/**
 * What each priority looks like: its glyph, and the ink that glyph is drawn in.
 *
 * A table rather than a chain of ternaries inside the component — the colocated `*.config.ts`
 * convention, and the same shape as {@link CARD_KIND_STYLES} next to it.
 *
 * **Colour reinforces, never carries.** The direction says it on its own — up for high, down for
 * low, an equals sign for the middle — so the three stay tellable apart by a red/blue colour-blind
 * reader, and `CardPriorityIcon` spells the priority out in its `title`/`aria-label` either way.
 *
 * **Fixed vivid hues, not theme tokens**, for the reason the kind tiles carry fixed hues: this mark
 * is hunted for down a whole column, so it has to be the same red and the same blue in every theme.
 * Two earlier attempts are worth not repeating — `--destructive` is a *fill* colour, and on the dark
 * themes it is a near-black maroon that made high priority the least visible of the three; the
 * `--tone-*` inks that replaced it are graded for ≤12px text on a tinted chip, which on a dark
 * surface means pale, and a pale pink chevron is not the red anyone is looking for. `red-500` and
 * `blue-500` clear the 3:1 non-text contrast floor on both a white card and a near-black one, which
 * is what neither theme-graded answer could do at once.
 *
 * **Normal keeps the muted ink on purpose.** It is the value nearly every card holds, and the glyph
 * rides every card face on the board: a third colour on everything would be a signal on nothing.
 */
export interface CardPriorityStyle {
  Icon: LucideIcon
  /** The glyph's size and ink — the equals sign reads a size smaller than the chevrons. */
  glyph: string
}

export const CARD_PRIORITY_STYLES: Record<BoardCardPriority, CardPriorityStyle> = {
  high: { Icon: ChevronUp, glyph: 'h-3.5 w-3.5 text-red-500' },
  normal: { Icon: Equal, glyph: 'h-3 w-3 text-muted-foreground' },
  low: { Icon: ChevronDown, glyph: 'h-3.5 w-3.5 text-blue-500' },
}

/** Falls back to normal for a priority written by a newer version of the app — an unknown value
 * should render as an ordinary card, not as a gap where the glyph should be. */
export function cardPriorityStyle(priority: BoardCardPriority): CardPriorityStyle {
  return CARD_PRIORITY_STYLES[priority] ?? CARD_PRIORITY_STYLES.normal
}
