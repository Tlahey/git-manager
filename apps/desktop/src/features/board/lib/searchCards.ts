import type { Board, BoardCard } from '@git-manager/git-types'
import { cardIdentifier } from './cardMeta'

/** One card, with the board it belongs to — the unit a cross-board search returns. */
export interface CardOnBoard {
  card: BoardCard
  board: Board
}

export interface CardSearchResult extends CardOnBoard {
  /** Lower is better. Exposed so a caller can group or debug, not to be rendered. */
  score: number
}

/** Enough to fill the palette twice over; past that the query is the thing to narrow, not the list. */
export const MAX_CARD_RESULTS = 50

/**
 * Ranks one card against a lowercased query. `null` means no match.
 *
 * **What is matched is what the result row shows**: the identifier, the title, the assignee and the
 * board's name — never the description. A description hit would put a row on screen whose every
 * visible word misses the query, which is the same trap the file tree fell into when a folder match
 * kept files that had nothing of the query in their own name: the user cannot tell why the row is
 * there, so they cannot tell whether it is the one they want.
 *
 * The order encodes what a query usually *is*. Someone typing `GM-7` knows exactly which ticket they
 * want and would be insulted by a title match above it; someone typing `login` is describing work,
 * so titles come next; assignee and board are the broad sweeps that answer "everything of Sam's" and
 * "everything on Sprint 12", and they sort last because a query that matches them matches many
 * cards at once.
 */
export function scoreCard({ card, board }: CardOnBoard, query: string): number | null {
  const byName = scoreCardName(card, query)
  if (byName !== null) return byName

  const title = card.title.toLowerCase()
  if (card.assignee?.toLowerCase().includes(query)) return 3000 + title.length
  if (board.name.toLowerCase().includes(query)) return 4000 + title.length
  return null
}

/**
 * The part of {@link scoreCard} that reads the card by the two names it is *called* — its identifier
 * and its title — leaving out the sweeps that answer "everything of Sam's" and "everything on Sprint
 * 12".
 *
 * Split out for the choosers that pick one card among a board's own: there, assignee and board name
 * match everything or nothing at once, so scoring on them would rank by something the user did not
 * type. One function rather than two rankings, so `GM-7` beats a title that merely contains `gm-7`
 * everywhere in the app.
 */
export function scoreCardName(card: BoardCard, query: string): number | null {
  // `undefined` for a card that predates its board's identifiers — it simply has nothing to match
  // on here, rather than matching on a `-0` nobody has ever seen on screen.
  const identifier = cardIdentifier(card)?.toLowerCase()
  const title = card.title.toLowerCase()

  if (identifier === query) return 0
  if (identifier?.startsWith(query)) return 100 + title.length
  if (title.startsWith(query)) return 1000 + title.length
  if (title.includes(query)) return 2000 + title.length
  return null
}

/**
 * The cards a relation may point at, best first, capped at {@link MAX_CARD_RESULTS}.
 *
 * **A blank query returns everything**, where {@link searchCards} returns nothing — the difference is
 * what the two are attached to. A palette opens on its own and "here are all 400 of your tickets" is
 * not an answer anyone asked for; this list hangs under a field the user opened to choose *one card
 * out of this board*, so showing what there is to choose from is the answer. Same reason the
 * `Combobox` opens on its full option list.
 */
export function matchLinkCandidates(candidates: BoardCard[], query: string): BoardCard[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return candidates.slice(0, MAX_CARD_RESULTS)

  const scored: { card: BoardCard; score: number }[] = []
  for (const card of candidates) {
    const score = scoreCardName(card, needle)
    if (score !== null) scored.push({ card, score })
  }
  scored.sort((a, b) => a.score - b.score || a.card.title.localeCompare(b.card.title))
  return scored.slice(0, MAX_CARD_RESULTS).map((entry) => entry.card)
}

/**
 * Every card matching `query`, best first, capped at {@link MAX_CARD_RESULTS}.
 *
 * Archived cards are **included**: the point of archiving over deleting is that the card is still
 * there, and a search that hid it would make the archive a hole rather than a drawer. The row says
 * so — see `BoardSearchDialog`.
 *
 * A blank query returns nothing rather than everything: this palette opens empty, on the same
 * reasoning as the command palette's file lookup, because "here are all 400 of your tickets" is not
 * an answer anyone opened a search for.
 */
export function searchCards(cards: CardOnBoard[], query: string): CardSearchResult[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const scored: CardSearchResult[] = []
  for (const entry of cards) {
    const score = scoreCard(entry, needle)
    if (score !== null) scored.push({ ...entry, score })
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.board.name.localeCompare(b.board.name) ||
      a.card.title.localeCompare(b.card.title)
  )
  return scored.slice(0, MAX_CARD_RESULTS)
}
