import type { Board, BoardCard, BoardCardPriority, BoardTag } from '@git-manager/git-types'

/**
 * Pure derivations from a card's metadata — the things the card face and the card dialog display but
 * that aren't stored: checklist progress, whether a due date has passed, and the colour stripe.
 *
 * Kept out of the components so each rule is testable on its own, per the colocated-`*.config.ts`
 * convention (see `components/git-graph/columns.config.ts`).
 */

/** How many bands the left stripe splits into at most. Past this they stop being distinguishable, so
 * further tags show only as chips — the chip row stays the complete list. */
export const MAX_STRIPE_BANDS = 4

export interface DodProgress {
  done: number
  total: number
  /** 0-100, rounded. `0` when there is nothing to do. */
  percent: number
}

/**
 * Counts a markdown task list. Matches GFM's own checkbox syntax (`- [ ]` / `* [x]`, any indent) so
 * what the app counts is exactly what GitHub renders as a checkbox — a card's DOD is the same string
 * on both backends.
 */
export function dodProgress(dod: string): DodProgress {
  const items = dod.match(/^[ \t]*[-*+][ \t]+\[[ xX]\]/gm) ?? []
  const done = items.filter((line) => /\[[xX]\]$/.test(line)).length
  const total = items.length
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/** Whether a due date is in the past. Compared as calendar days: a card due today is not overdue
 * until tomorrow, which is what "due `YYYY-MM-DD`" means to a person. */
export function isOverdue(dueDate: string | undefined, today: Date = new Date()): boolean {
  if (!dueDate) return false
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
  return dueDate < todayKey
}

/**
 * The card's human identifier — `GM-1` — or `undefined` when it has none.
 *
 * Read off the card alone, not the board: the prefix is the card's own, which is what lets the
 * identifier survive a move to another board. Both halves have to be there — a card created with no
 * prefix has opted out, and number `0` predates the counter. Showing `-1` or `GM-0` in either case
 * would be worse than showing nothing.
 */
export function cardIdentifier(
  card: Pick<BoardCard, 'prefix' | 'number'>
): string | undefined {
  if (!card.prefix || !card.number) return undefined
  return `${card.prefix}-${card.number}`
}

/** Sort weight: high first, then normal, then low. */
export function priorityRank(priority: BoardCardPriority): number {
  return priority === 'high' ? 0 : priority === 'low' ? 2 : 1
}

/** The card's tags, resolved against the board palette and returned **in the board's own order** —
 * so a given pair of tags always looks the same, whichever order they were added to the card in. */
export function resolveCardTags(board: Pick<Board, 'tags'>, card: Pick<BoardCard, 'tagIds'>): BoardTag[] {
  return board.tags.filter((tag) => card.tagIds.includes(tag.id))
}

/**
 * The card's left-edge colour stripe as a CSS value, or `undefined` when the card has no tags (and
 * so gets no stripe at all rather than a transparent one).
 *
 * One tag paints a solid colour. Several paint equal, hard-edged bands top to bottom — duplicated
 * gradient stops, so the boundaries are crisp rather than a blend that would invent colours no tag
 * has. Capped at {@link MAX_STRIPE_BANDS}.
 */
export function tagStripeBackground(tags: BoardTag[]): string | undefined {
  const bands = tags.slice(0, MAX_STRIPE_BANDS)
  if (bands.length === 0) return undefined
  if (bands.length === 1) return bands[0].color

  const step = 100 / bands.length
  const stops = bands.flatMap((tag, index) => [
    `${tag.color} ${(index * step).toFixed(2)}%`,
    `${tag.color} ${((index + 1) * step).toFixed(2)}%`,
  ])
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}
