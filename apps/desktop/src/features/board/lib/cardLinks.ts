import type {
  BoardCard,
  BoardCardLink,
  BoardLinkInverseKind,
  BoardLinkKind,
} from '@git-manager/git-types'

/**
 * Reading and writing the relationships between cards.
 *
 * **Only forward halves are stored** — `blocks` on the blocker, `contains` on the epic (see
 * `BoardCardLink`). Everything a card shows about being *blocked by* or *part of* something is
 * derived here by looking at what the other cards declare, and is never written: two stored halves
 * are two things that can disagree, and a half-deleted link is a bug with no natural repair.
 *
 * Two consequences the UI has to live with, both of them the price of that rule rather than
 * oversights:
 *
 * - A link whose other end is on a **board that isn't loaded** resolves to no card. It is still
 *   shown — it is real — but as the board's name rather than as a ticket (see
 *   {@link ResolvedLink.card}).
 * - An **inverse** from a card on another board is invisible, because deriving it would mean
 *   reading every board. A card only ever knows it is blocked by something it can see.
 */

/** How each stored kind reads from the *target's* side. `relates` is its own inverse. */
export const INVERSE_OF: Record<BoardLinkKind, BoardLinkInverseKind> = {
  relates: 'relates',
  blocks: 'blockedBy',
  contains: 'partOf',
}

/** The stored half a relation picked in the UI corresponds to. */
export const FORWARD_OF: Record<BoardLinkKind | BoardLinkInverseKind, BoardLinkKind> = {
  relates: 'relates',
  blocks: 'blocks',
  contains: 'contains',
  blockedBy: 'blocks',
  partOf: 'contains',
}

/** How a relation reads from the card being displayed. */
export type DisplayedLinkKind = BoardLinkKind | BoardLinkInverseKind

/**
 * The order the groups read in: the containment relation first (it is the strongest statement about
 * what a card *is*), then blocking (what stops work), then the loosest. Fixed rather than
 * insertion-ordered so a card's relationships look the same every time it is opened.
 */
export const LINK_KIND_ORDER: DisplayedLinkKind[] = [
  'contains',
  'partOf',
  'blocks',
  'blockedBy',
  'relates',
]

export interface ResolvedLink {
  /** How the relation reads from the displayed card's side. */
  kind: DisplayedLinkKind
  /** The card at the other end — `undefined` when it lives on a board that isn't loaded. */
  card?: BoardCard
  targetBoardId: string
  targetCardId: string
  /** The card whose `links` hold the stored half: where removing the relation writes. */
  owner: BoardCard
  /** The stored half itself, as it sits on `owner.links`. */
  stored: BoardCardLink
}

function sameLink(a: BoardCardLink, b: BoardCardLink): boolean {
  return (
    a.kind === b.kind && a.targetBoardId === b.targetBoardId && a.targetCardId === b.targetCardId
  )
}

/**
 * Every relation a card takes part in, as it should be read from that card.
 *
 * Both halves come back in one list — the forward ones it declares itself, and the inverse ones
 * derived from other cards pointing at it — because to a reader they are the same kind of fact.
 * `cards` is the loaded board, which is what bounds the derivation.
 */
export function resolveCardLinks(card: BoardCard, cards: BoardCard[]): ResolvedLink[] {
  const forward: ResolvedLink[] = card.links.map((stored) => ({
    kind: stored.kind,
    stored,
    owner: card,
    card: cards.find((c) => c.id === stored.targetCardId && c.boardId === stored.targetBoardId),
    targetBoardId: stored.targetBoardId,
    targetCardId: stored.targetCardId,
  }))

  const inverse: ResolvedLink[] = cards
    .filter((other) => other.id !== card.id)
    .flatMap((other) =>
      other.links
        .filter((l) => l.targetCardId === card.id && l.targetBoardId === card.boardId)
        .map((stored) => ({
          kind: INVERSE_OF[stored.kind],
          stored,
          owner: other,
          card: other,
          targetBoardId: other.boardId,
          targetCardId: other.id,
        }))
    )

  // Two cards can each declare `relates` to the other, which reads as one relation and must show as
  // one row. The forward half wins, so the row stays removable from the card you are looking at.
  //
  // Matched on the **board too**, not the card id alone: a remote card's id is its bare issue
  // number, so the same number identifies different cards on different boards. Ignoring the board
  // collapsed two genuinely distinct links into one row — and the hidden one could then only be
  // removed by removing the visible one first.
  const deduped = [...forward, ...inverse].filter(
    (link, index, all) =>
      all.findIndex(
        (l) =>
          l.kind === link.kind &&
          l.targetCardId === link.targetCardId &&
          l.targetBoardId === link.targetBoardId
      ) === index
  )

  return deduped.sort(
    (a, b) => LINK_KIND_ORDER.indexOf(a.kind) - LINK_KIND_ORDER.indexOf(b.kind)
  )
}

/**
 * The single card write that creates a relation, or `null` when there is nothing to write.
 *
 * Picking "blocked by X" from a card writes `blocks` on **X**, not an inverse half here — which is
 * why this returns the card to patch rather than just a link list. Refuses a card linked to itself
 * and a relation that already exists, so the UI never sends a write that changes nothing.
 */
export function linkWrite(
  from: BoardCard,
  target: BoardCard,
  kind: DisplayedLinkKind
): { card: BoardCard; links: BoardCardLink[] } | null {
  if (target.id === from.id && target.boardId === from.boardId) return null

  const stores = FORWARD_OF[kind]
  const inverse = kind === 'blockedBy' || kind === 'partOf'
  const owner = inverse ? target : from
  const other = inverse ? from : target

  const link: BoardCardLink = {
    targetBoardId: other.boardId,
    targetCardId: other.id,
    kind: stores,
  }
  if (owner.links.some((l) => sameLink(l, link))) return null
  return { card: owner, links: [...owner.links, link] }
}

/** The owning card's link list with `link` gone — the whole list, since `BoardCardPatch.links` is
 * replaced wholesale. */
export function unlinkWrite(link: ResolvedLink): BoardCardLink[] {
  return link.owner.links.filter((l) => !sameLink(l, link.stored))
}

/**
 * The card this one is **part of** — its parent, in breadcrumb terms.
 *
 * Derived, never stored: it is the inverse of a `contains` declared by the parent, which is why an
 * epic listing its items and a card naming its parent are one fact read from two ends.
 *
 * The model permits several — nothing stops two epics both declaring they contain the same card —
 * but a breadcrumb names one place, so this returns the first and the relations section keeps
 * showing all of them. Naming one of two parents is a partial truth; inventing a rule about which
 * one wins would be a false one.
 */
export function parentOf(card: BoardCard, cards: BoardCard[]): ResolvedLink | undefined {
  return resolveCardLinks(card, cards).find((link) => link.kind === 'partOf')
}
