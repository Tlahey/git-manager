import type { BoardCard, BoardCardPriority, BoardColumn, SprintSummary } from '@git-manager/git-types'
import { isOverdue, priorityRank } from './cardMeta'

/**
 * A sprint's outcome, computed from its columns and cards.
 *
 * Lives in TypeScript and is *passed to* whichever backend closes the board, rather than being
 * computed in Rust: both backends then store identical numbers, and the arithmetic is unit-tested in
 * one place instead of twice in two languages. See `git_board.rs`'s `close_board` for why the result
 * is then frozen rather than recomputed on read.
 */

const PRIORITIES: BoardCardPriority[] = ['high', 'normal', 'low']

/** The column ids that mean "finished". A board whose author never ticked the flag has none — every
 * card then counts as unfinished, which is the honest reading of "no column means done". */
export function doneColumnIds(columns: BoardColumn[]): Set<string> {
  return new Set(columns.filter((c) => c.isDone).map((c) => c.id))
}

export function isCardDone(card: BoardCard, doneIds: Set<string>): boolean {
  return doneIds.has(card.columnId)
}

/** The cards a sprint closure would carry over — everything not in a done column. */
export function unfinishedCards(cards: BoardCard[], columns: BoardColumn[]): BoardCard[] {
  const doneIds = doneColumnIds(columns)
  return cards.filter((card) => !isCardDone(card, doneIds))
}

export function computeSprintSummary(
  columns: BoardColumn[],
  cards: BoardCard[],
  closedAt: string,
  today: Date = new Date()
): SprintSummary {
  const doneIds = doneColumnIds(columns)
  const doneCards = cards.filter((card) => isCardDone(card, doneIds))

  const byColumn = [...columns]
    .sort((a, b) => a.order - b.order)
    .map((column) => ({
      columnId: column.id,
      columnName: column.name,
      count: cards.filter((card) => card.columnId === column.id).length,
    }))

  const byPriority = PRIORITIES.sort((a, b) => priorityRank(a) - priorityRank(b)).map(
    (priority) => ({
      priority,
      count: cards.filter((card) => card.priority === priority).length,
    })
  )

  // Unassigned cards are deliberately left out: an "unassigned" row in a per-person breakdown reads
  // as a person who did nothing, when it means nobody was asked.
  const assignees = [...new Set(cards.map((card) => card.assignee).filter(Boolean))] as string[]
  const byAssignee = assignees.sort().map((assignee) => {
    const own = cards.filter((card) => card.assignee === assignee)
    return {
      assignee,
      total: own.length,
      done: own.filter((card) => isCardDone(card, doneIds)).length,
    }
  })

  return {
    closedAt,
    totalCards: cards.length,
    doneCards: doneCards.length,
    unfinishedCards: cards.length - doneCards.length,
    completionRate: cards.length === 0 ? 0 : Math.round((doneCards.length / cards.length) * 100),
    blockedCards: cards.filter((card) => card.blockedReason).length,
    // Only unfinished work can be overdue: a card delivered after its due date was late, but it is
    // no longer outstanding, and counting it would make a finished sprint look like it still owes
    // something.
    overdueCards: cards.filter(
      (card) => !isCardDone(card, doneIds) && isOverdue(card.dueDate, today)
    ).length,
    byColumn,
    byPriority,
    byAssignee,
  }
}

/**
 * Which column the sprint close's "archive the finished cards" box points at when it opens.
 *
 * The one flagged done, since that is the board's own statement about where finished work sits — the
 * sprint report above reads off the same flag, so the two cannot disagree about what "finished"
 * means. Failing that, the last column by order: a board whose author never set the flag has almost
 * always still put "done" at the right-hand end, and that guess is one the user can see and change in
 * the picker beside the box.
 */
export function defaultArchiveColumnId(columns: BoardColumn[]): string {
  const ordered = [...columns].sort((a, b) => a.order - b.order)
  return (ordered.find((c) => c.isDone) ?? ordered[ordered.length - 1])?.id ?? ''
}
