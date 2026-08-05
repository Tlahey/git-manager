import { describe, it, expect } from 'vitest'
import type { BoardColumn } from '@git-manager/git-types'
import { makeCard } from '../test/boardFactories'
import { computeSprintSummary, doneColumnIds, unfinishedCards } from './sprintStats'

const CLOSED_AT = '2026-08-04T10:00:00.000Z'
const TODAY = new Date(2026, 7, 4)

const columns: BoardColumn[] = [
  { id: 'todo', name: 'To do', order: 0 },
  { id: 'wip', name: 'In progress', order: 1 },
  { id: 'done', name: 'Done', order: 2, isDone: true },
]

describe('doneColumnIds', () => {
  it('collects only the columns flagged as done', () => {
    expect([...doneColumnIds(columns)]).toEqual(['done'])
  })

  it('is empty when no column is flagged, so nothing counts as finished', () => {
    expect(doneColumnIds([{ id: 'todo', name: 'To do', order: 0 }]).size).toBe(0)
  })
})

describe('unfinishedCards', () => {
  it('returns everything outside a done column — what a closure carries over', () => {
    const cards = [
      makeCard({ id: 'a', columnId: 'todo' }),
      makeCard({ id: 'b', columnId: 'wip' }),
      makeCard({ id: 'c', columnId: 'done' }),
    ]
    expect(unfinishedCards(cards, columns).map((c) => c.id)).toEqual(['a', 'b'])
  })
})

describe('computeSprintSummary', () => {
  it('reports an empty sprint as 0% rather than dividing by zero', () => {
    const summary = computeSprintSummary(columns, [], CLOSED_AT, TODAY)
    expect(summary.totalCards).toBe(0)
    expect(summary.completionRate).toBe(0)
  })

  it('counts done, unfinished and the completion rate', () => {
    const cards = [
      makeCard({ id: 'a', columnId: 'done' }),
      makeCard({ id: 'b', columnId: 'done' }),
      makeCard({ id: 'c', columnId: 'todo' }),
      makeCard({ id: 'd', columnId: 'wip' }),
    ]
    const summary = computeSprintSummary(columns, cards, CLOSED_AT, TODAY)
    expect(summary.doneCards).toBe(2)
    expect(summary.unfinishedCards).toBe(2)
    expect(summary.completionRate).toBe(50)
    expect(summary.closedAt).toBe(CLOSED_AT)
  })

  it('breaks the sprint down by column, in column order', () => {
    const cards = [
      makeCard({ id: 'a', columnId: 'done' }),
      makeCard({ id: 'b', columnId: 'todo' }),
      makeCard({ id: 'c', columnId: 'todo' }),
    ]
    const summary = computeSprintSummary(columns, cards, CLOSED_AT, TODAY)
    expect(summary.byColumn).toEqual([
      { columnId: 'todo', columnName: 'To do', count: 2 },
      { columnId: 'wip', columnName: 'In progress', count: 0 },
      { columnId: 'done', columnName: 'Done', count: 1 },
    ])
  })

  it('breaks the sprint down by priority, high first', () => {
    const cards = [
      makeCard({ id: 'a', priority: 'low' }),
      makeCard({ id: 'b', priority: 'high' }),
      makeCard({ id: 'c', priority: 'high' }),
    ]
    const summary = computeSprintSummary(columns, cards, CLOSED_AT, TODAY)
    expect(summary.byPriority).toEqual([
      { priority: 'high', count: 2 },
      { priority: 'normal', count: 0 },
      { priority: 'low', count: 1 },
    ])
  })

  it('breaks the sprint down per assignee, and leaves unassigned work out of it', () => {
    const cards = [
      makeCard({ id: 'a', assignee: 'ada', columnId: 'done' }),
      makeCard({ id: 'b', assignee: 'ada', columnId: 'todo' }),
      makeCard({ id: 'c', assignee: 'grace', columnId: 'done' }),
      makeCard({ id: 'd', columnId: 'todo' }),
    ]
    const summary = computeSprintSummary(columns, cards, CLOSED_AT, TODAY)
    expect(summary.byAssignee).toEqual([
      { assignee: 'ada', total: 2, done: 1 },
      { assignee: 'grace', total: 1, done: 1 },
    ])
  })

  it('counts blocked cards', () => {
    const cards = [
      makeCard({ id: 'a', blockedReason: 'Waiting on API' }),
      makeCard({ id: 'b' }),
    ]
    expect(computeSprintSummary(columns, cards, CLOSED_AT, TODAY).blockedCards).toBe(1)
  })

  it('counts only unfinished work as overdue', () => {
    const cards = [
      // Past due and still open — genuinely outstanding.
      makeCard({ id: 'a', columnId: 'todo', dueDate: '2026-08-01' }),
      // Past due but delivered: late, not still owed.
      makeCard({ id: 'b', columnId: 'done', dueDate: '2026-08-01' }),
      makeCard({ id: 'c', columnId: 'todo', dueDate: '2026-09-01' }),
    ]
    expect(computeSprintSummary(columns, cards, CLOSED_AT, TODAY).overdueCards).toBe(1)
  })

  it('treats every card as unfinished when no column is flagged as done', () => {
    const flat: BoardColumn[] = [{ id: 'todo', name: 'To do', order: 0 }]
    const cards = [makeCard({ id: 'a' }), makeCard({ id: 'b' })]
    const summary = computeSprintSummary(flat, cards, CLOSED_AT, TODAY)
    expect(summary.doneCards).toBe(0)
    expect(summary.unfinishedCards).toBe(2)
    expect(summary.completionRate).toBe(0)
  })
})
