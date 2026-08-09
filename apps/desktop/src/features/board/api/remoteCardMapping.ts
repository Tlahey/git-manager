import type { Board, BoardCard, BoardCardKind, BoardCardPriority } from '@git-manager/git-types'
import { parseCardBody } from './cardBodyMarkdown'

/**
 * Pure card ⇄ GitHub-issue mapping for the remote board — the label arithmetic and the read side,
 * with no network in sight so it can be tested directly. The calls that act on it live in
 * `remote-board.api.ts`.
 *
 * **Labels are derived output, never input.** The app computes the labels a card *should* carry and
 * reconciles the issue towards that, touching only labels it manages (this board's column labels, the
 * board's own tag names, `priority:*`, `blocked`) and leaving every other label on the issue alone —
 * a repo's own `good first issue` must survive a card edit.
 *
 * The consequence worth knowing: hand-adding `blocked` on github.com does not make a card blocked in
 * the app. The blocking *reason* is the source of truth (it lives in the body's metadata marker, since
 * GitHub has nowhere to put free text), and a card cannot be blocked without one — so a bare label
 * carries no information the model can accept, and the next write removes it.
 */

export const BLOCKED_LABEL = 'blocked'
export const BLOCKED_LABEL_COLOR = 'b60205'

/**
 * Archiving, on a GitHub board.
 *
 * A card's `archivedAt` had no home here at all: the patch was accepted, no label or body field
 * carried it, and the card came back from the next read unarchived — the exact failure the backend
 * contract warns about ("a field one backend quietly dropped would look saved and come back empty").
 *
 * A label rather than a body marker, because archiving is a *state* the board filters on, like the
 * column and the blocked flag, and because it stays visible and reversible on github.com. The cost is
 * that a label carries no timestamp: the archive date is approximated by the issue's `updated_at`,
 * which is the moment the label was applied for as long as nothing else has touched the issue since.
 * Good enough for a list sorted "most recently archived first"; not a date to report on.
 */
export const ARCHIVED_LABEL = 'archived'

/** `normal` is deliberately absent: it is the *absence* of a priority label, so the common case adds
 * no label noise to the repository. */
export const PRIORITY_LABELS: Record<'high' | 'low', { name: string; color: string }> = {
  high: { name: 'priority:high', color: 'd73a4a' },
  low: { name: 'priority:low', color: '0e8a16' },
}

/** `task` is the absence of a kind label, so the common case adds no label noise to the repo — the
 * same rule as `normal` priority. */
export const KIND_LABELS: Record<'bug' | 'epic', { name: string; color: string }> = {
  bug: { name: 'type:bug', color: 'd73a4a' },
  epic: { name: 'type:epic', color: '8b5cf6' },
}

export function kindFromLabels(labelNames: string[]): BoardCardKind {
  if (labelNames.includes(KIND_LABELS.epic.name)) return 'epic'
  if (labelNames.includes(KIND_LABELS.bug.name)) return 'bug'
  return 'task'
}

export function boardLabelPrefix(boardId: string): string {
  return `board:${boardId}:status:`
}

export function boardColumnLabel(boardId: string, columnId: string): string {
  return `${boardLabelPrefix(boardId)}${columnId}`
}

/** Shared with `trackedIssueMapping`, which reads a tracked card's priority the same way. */
export function priorityFromLabels(labelNames: string[]): BoardCardPriority {
  if (labelNames.includes(PRIORITY_LABELS.high.name)) return 'high'
  if (labelNames.includes(PRIORITY_LABELS.low.name)) return 'low'
  return 'normal'
}

/** Every label this board owns on a given card — what the issue is reconciled towards. */
export function managedLabelsFor(board: Board, card: BoardCard): string[] {
  const labels = [boardColumnLabel(board.id, card.columnId)]
  for (const tagId of card.tagIds) {
    const tag = board.tags.find((t) => t.id === tagId)
    if (tag) labels.push(tag.name)
  }
  if (card.priority === 'high' || card.priority === 'low') {
    labels.push(PRIORITY_LABELS[card.priority].name)
  }
  if (card.blockedReason) labels.push(BLOCKED_LABEL)
  if (card.kind === 'bug' || card.kind === 'epic') labels.push(KIND_LABELS[card.kind].name)
  if (card.archivedAt) labels.push(ARCHIVED_LABEL)
  return labels
}

/** Whether a label on the issue is one this board controls — and may therefore remove. */
export function isManagedLabel(board: Board, labelName: string): boolean {
  return (
    labelName.startsWith(boardLabelPrefix(board.id)) ||
    labelName === BLOCKED_LABEL ||
    labelName === ARCHIVED_LABEL ||
    labelName === PRIORITY_LABELS.high.name ||
    labelName === PRIORITY_LABELS.low.name ||
    labelName === KIND_LABELS.bug.name ||
    labelName === KIND_LABELS.epic.name ||
    board.tags.some((t) => t.name === labelName)
  )
}

/** The add/remove pair that moves an issue's labels to `desired` without disturbing labels this
 * board doesn't own. */
export function reconcileLabels(
  board: Board,
  currentLabels: string[],
  desired: string[]
): { toAdd: string[]; toRemove: string[] } {
  const toAdd = desired.filter((l) => !currentLabels.includes(l))
  const toRemove = currentLabels.filter((l) => isManagedLabel(board, l) && !desired.includes(l))
  return { toAdd, toRemove }
}

export interface RawIssueForCard {
  number: number
  title: string
  body: string
  updatedAt: string
  labels: string[]
  assignees: string[]
  /** GitHub's own comment count — enough for the card face, so the thread itself stays lazy. */
  commentCount?: number
}

/**
 * Builds a card from an issue, or `null` when the issue carries no column label for this board (it
 * simply isn't on this board).
 *
 * `order` has no GitHub-native home — no field survives a Kanban-style manual reorder — so it is
 * derived from the issue number. Deterministic, but a same-column drag reorder cannot persist on this
 * backend. `comments` comes back empty and is fetched on demand; see `fetchIssueComments`.
 */
export function cardFromIssue(board: Board, raw: RawIssueForCard): BoardCard | null {
  const prefix = boardLabelPrefix(board.id)
  const columnLabel = raw.labels.find((l) => l.startsWith(prefix))
  if (!columnLabel) return null

  const { description, dod, meta } = parseCardBody(raw.body)

  return {
    id: String(raw.number),
    boardId: board.id,
    columnId: columnLabel.slice(prefix.length),
    title: raw.title,
    description,
    order: raw.number,
    linkedBranch: meta.linkedBranch,
    revision: raw.updatedAt,
    // The card's own prefix, from the body — the issue number below is the *issue's* identity, not
    // the ticket's, and the two have to stay tellable apart.
    prefix: meta.prefix ?? '',
    kind: kindFromLabels(raw.labels),
    links: meta.links ?? [],
    // The issue number *is* the identifier here: GitHub already guarantees it is unique in the repo
    // and never reassigned, which is exactly what a board's own counter has to work to achieve.
    number: raw.number,
    assignee: raw.assignees[0],
    priority: priorityFromLabels(raw.labels),
    dueDate: meta.dueDate,
    tagIds: board.tags.filter((t) => raw.labels.includes(t.name)).map((t) => t.id),
    blockedReason: meta.blockedReason,
    // The label is the flag; `updated_at` stands in for the moment it was applied — see
    // {@link ARCHIVED_LABEL} for why an approximate date is the honest price of using one.
    archivedAt: raw.labels.includes(ARCHIVED_LABEL) ? raw.updatedAt : undefined,
    dod,
    comments: [],
    schemaVersion: 2,
    updatedAt: raw.updatedAt,
  }
}
