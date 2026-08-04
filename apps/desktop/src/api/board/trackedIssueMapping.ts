import type { Board, BoardCard, BoardCardPatch } from '@git-manager/git-types'
import { composeCardBody, parseCardBody } from './cardBodyMarkdown'
import {
  BLOCKED_LABEL,
  PRIORITY_LABELS,
  priorityFromLabels,
  type RawIssueForCard,
} from './remoteCardMapping'

/**
 * Card ⇄ GitHub-issue mapping for a **tracked** card on a *local* board — pure, no network.
 *
 * A tracked card is a hybrid the remote board isn't: the issue owns the content (title, body,
 * checklist, assignee, and the fields encoded as labels), while the local board owns the placement
 * (`columnId`, `order`) and the archive flag. That split is the whole point — it buys the one thing
 * the remote backend cannot do, a drag-reorder that persists (see `cardFromIssue`, where `order` is
 * derived from the issue number because GitHub has nowhere to put it).
 *
 * **This never touches a `board:<id>:status:<column>` label.** Those belong to *remote* boards, and
 * the same issue may well be on one at the same time as it is tracked here. `reconcileLabels` from
 * `remoteCardMapping` would strip them, since from its point of view an unlisted managed label is one
 * to remove — so the reconcile below is a separate function rather than a reuse, and the column
 * prefix is explicitly excluded from what it may delete.
 */

/** A tracked issue as fetched: the remote board's shape plus the state, which a tracked card shows
 * and a remote card gets from being on the board at all. */
export interface RawTrackedIssue extends RawIssueForCard {
  state: 'open' | 'closed'
}

/**
 * Overlays a fetched issue onto the stored local card.
 *
 * The stored card is not discarded: it is the offline cache. When the issue can't be fetched the
 * caller simply keeps the card as-is, so an unreachable GitHub shows stale content rather than a
 * blank card — which is why every field the issue owns is also persisted locally.
 */
export function mergeTrackedIssue(board: Board, card: BoardCard, issue: RawTrackedIssue): BoardCard {
  const { description, dod, meta } = parseCardBody(issue.body)

  return {
    ...card,
    // Local, and deliberately not overwritten: placement, identity and the archive flag have no
    // GitHub-native home.
    id: card.id,
    boardId: card.boardId,
    columnId: card.columnId,
    order: card.order,
    number: card.number,
    archivedAt: card.archivedAt,
    revision: card.revision,
    // The issue's, from here down.
    title: issue.title,
    description,
    dod,
    assignee: issue.assignees[0],
    priority: priorityFromLabels(issue.labels),
    tagIds: board.tags.filter((t) => issue.labels.includes(t.name)).map((t) => t.id),
    dueDate: meta.dueDate,
    blockedReason: meta.blockedReason,
    linkedBranch: meta.linkedBranch,
    issueState: issue.state,
  }
}

/**
 * Applies a patch to a card in memory.
 *
 * Needed because a tracked card's issue is written *before* the local store, so the issue write has
 * to be built from a card that doesn't exist anywhere yet. Ordering it that way makes a failed
 * GitHub call leave both sides untouched, rather than a local card claiming a change the issue never
 * received.
 *
 * Follows the patch's own "unchanged vs cleared" encoding: an absent key leaves the field alone, an
 * explicit `null` clears it.
 */
export function applyCardPatch(card: BoardCard, patch: BoardCardPatch): BoardCard {
  const next = { ...card }
  for (const [key, value] of Object.entries(patch)) {
    Object.assign(next, { [key]: value === null ? undefined : value })
  }
  return next
}

/** Whether a card field belongs to the issue rather than to the local board. */
export function isIssueOwnedField(field: keyof BoardCardPatch): boolean {
  return (
    field === 'title' ||
    field === 'description' ||
    field === 'dod' ||
    field === 'assignee' ||
    field === 'priority' ||
    field === 'tagIds' ||
    field === 'dueDate' ||
    field === 'blockedReason' ||
    field === 'linkedBranch'
  )
}

/** Splits a patch into the part the issue must receive and the part that stays local. */
export function splitPatch(patch: BoardCardPatch): {
  issuePatch: BoardCardPatch
  localPatch: BoardCardPatch
} {
  const issuePatch: BoardCardPatch = {}
  const localPatch: BoardCardPatch = {}
  for (const [key, value] of Object.entries(patch)) {
    const target = isIssueOwnedField(key as keyof BoardCardPatch) ? issuePatch : localPatch
    Object.assign(target, { [key]: value })
  }
  return { issuePatch, localPatch }
}

/** The labels a tracked card owns on its issue — the column label is **not** among them. */
export function trackedLabelsFor(board: Board, card: BoardCard): string[] {
  const labels: string[] = []
  for (const tagId of card.tagIds) {
    const tag = board.tags.find((t) => t.id === tagId)
    if (tag) labels.push(tag.name)
  }
  if (card.priority === 'high' || card.priority === 'low') {
    labels.push(PRIORITY_LABELS[card.priority].name)
  }
  if (card.blockedReason) labels.push(BLOCKED_LABEL)
  return labels
}

/** Whether a label on the issue is one a *tracked* card controls, and may therefore remove. */
export function isTrackedManagedLabel(board: Board, labelName: string): boolean {
  // A remote board's column label is off-limits: that board, not this card, owns it.
  if (labelName.startsWith('board:')) return false
  return (
    labelName === BLOCKED_LABEL ||
    labelName === PRIORITY_LABELS.high.name ||
    labelName === PRIORITY_LABELS.low.name ||
    board.tags.some((t) => t.name === labelName)
  )
}

export function reconcileTrackedLabels(
  board: Board,
  currentLabels: string[],
  desired: string[]
): { toAdd: string[]; toRemove: string[] } {
  return {
    toAdd: desired.filter((l) => !currentLabels.includes(l)),
    toRemove: currentLabels.filter(
      (l) => isTrackedManagedLabel(board, l) && !desired.includes(l)
    ),
  }
}

/**
 * The issue body a card should have.
 *
 * Composed from the *merged* card, so a patch that touches only the due date still round-trips the
 * description and checklist rather than blanking them.
 */
export function bodyForTrackedCard(card: BoardCard): string {
  return composeCardBody({
    description: card.description,
    dod: card.dod,
    meta: {
      dueDate: card.dueDate,
      blockedReason: card.blockedReason,
      linkedBranch: card.linkedBranch,
    },
  })
}

/** Reads an issue number out of what someone pasted: a bare number, `#123`, or a github.com URL. */
export function parseIssueReference(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const fromUrl = trimmed.match(/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)/)
  const digits = fromUrl ? fromUrl[1] : trimmed.replace(/^#/, '')
  if (!/^\d+$/.test(digits)) return null

  const parsed = Number(digits)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
