import { contrastRatio, type Rgb } from '@git-manager/theme'
import type { Board, BoardCard, BoardCardPriority, BoardTag } from '@git-manager/git-types'

/**
 * Pure derivations from a card's metadata — the things the card face and the card dialog display but
 * that aren't stored: checklist progress, whether a due date has passed, the human identifier and
 * the ink a filled tag badge needs.
 *
 * Kept out of the components so each rule is testable on its own, per the colocated-`*.config.ts`
 * convention (see `features/graph/lib/columns.config.ts`).
 */

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

/**
 * A date as the `YYYY-MM-DD` a due date is stored and compared as.
 *
 * Built from the *local* calendar fields rather than `toISOString()`, which converts to UTC first
 * and so hands back yesterday's date for anyone west of Greenwich for part of every day.
 */
export function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Whether a due date is in the past. Compared as calendar days: a card due today is not overdue
 * until tomorrow, which is what "due `YYYY-MM-DD`" means to a person. */
export function isOverdue(dueDate: string | undefined, today: Date = new Date()): boolean {
  if (!dueDate) return false
  return dueDate < toDateKey(today)
}

export interface DueDateShortcut {
  /** Names the offer; the copy lives under `card.dueDate.<key>`. */
  key: 'today' | 'tomorrow' | 'nextWeek'
  /** The date it stands for, as stored. */
  date: string
}

/**
 * The dates worth offering as a click: today, tomorrow, this day next week.
 *
 * Deadlines set from a board are overwhelmingly one of those three, and a date typed into a picker
 * is a calendar lookup for something the app already knows. The exact date is shown beside each
 * label all the same — an offer the user cannot check is an offer they have to trust.
 *
 * Day arithmetic through `Date`'s own overflow (day 32 of January is 1 February), so a month end and
 * a leap year need no special case here.
 */
export function dueDateShortcuts(today: Date = new Date()): DueDateShortcut[] {
  const at = (days: number) =>
    toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days))
  return [
    { key: 'today', date: at(0) },
    { key: 'tomorrow', date: at(1) },
    { key: 'nextWeek', date: at(7) },
  ]
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

/**
 * How GitHub refers to this card — `#42` — or `undefined` when no issue is behind it.
 *
 * Two ways a card can be an issue, and they are not the same shape. A **tracked** card on a local
 * board keeps the reference in {@link BoardCard.sourceIssue}; a card on a **remote** board simply
 * *is* an issue, and its `number` is the issue's, allocated by GitHub (see
 * `remoteCardMapping.cardFromIssue`). Hence the board's source: nothing on the card itself tells the
 * second case apart from a local card that happens to be numbered.
 *
 * Distinct from {@link cardIdentifier}, and deliberately shown next to it rather than instead of it:
 * a tracked card carries two numbers — where the work sits on this board, and what the issue is
 * called on GitHub — and neither stands in for the other.
 */
export function issueReference(
  card: Pick<BoardCard, 'number' | 'sourceIssue'>,
  boardSource?: Board['source']
): string | undefined {
  if (card.sourceIssue) return `#${card.sourceIssue.number}`
  if (boardSource === 'remote' && card.number) return `#${card.number}`
  return undefined
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

/** Near-black rather than pure black: the same ink the light themes use for body text. */
const BADGE_INK_DARK = '#171717'
const BADGE_INK_LIGHT = '#ffffff'

const RGB_OF: Record<string, Rgb> = {
  [BADGE_INK_DARK]: { r: 23, g: 23, b: 23 },
  [BADGE_INK_LIGHT]: { r: 255, g: 255, b: 255 },
}

/** `#abc` / `#aabbcc` (with or without the `#`) to channels, or `null` for anything else. */
export function hexToRgb(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

/**
 * Black or white ink for a filled badge, whichever is legible on `background`.
 *
 * A tag's colour is picked by the user from a colour input, so it can be anything — a filled badge
 * with one fixed text colour is a badge that becomes unreadable on the first pale yellow anyone
 * chooses. The choice is made by measuring, using the same `contrastRatio` the theme package grades
 * its own tokens with, rather than by a luminance threshold guessed here.
 *
 * An unparseable colour falls back to dark ink: the badge then renders on whatever the browser makes
 * of the value, and dark-on-unknown is the safer of the two guesses on a light surface.
 */
export function readableTextOn(background: string): string {
  const rgb = hexToRgb(background)
  if (!rgb) return BADGE_INK_DARK
  return contrastRatio(RGB_OF[BADGE_INK_DARK], rgb) >= contrastRatio(RGB_OF[BADGE_INK_LIGHT], rgb)
    ? BADGE_INK_DARK
    : BADGE_INK_LIGHT
}
