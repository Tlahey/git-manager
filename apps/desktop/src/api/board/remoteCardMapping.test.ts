import { describe, it, expect } from 'vitest'
import { makeBoard, makeCard } from '../../test/boardFactories'
import {
  BLOCKED_LABEL,
  PRIORITY_LABELS,
  boardColumnLabel,
  cardFromIssue,
  isManagedLabel,
  managedLabelsFor,
  reconcileLabels,
  type RawIssueForCard,
} from './remoteCardMapping'

const board = makeBoard({
  id: 'b1',
  tags: [
    { id: 't-bug', name: 'bug', color: '#ff0000' },
    { id: 't-ui', name: 'ui', color: '#00ff00' },
  ],
})

function issue(overrides: Partial<RawIssueForCard> = {}): RawIssueForCard {
  return {
    number: 42,
    title: 'Fix the header',
    body: '',
    updatedAt: '2026-08-01T00:00:00.000Z',
    labels: [boardColumnLabel('b1', 'todo')],
    assignees: [],
    ...overrides,
  }
}

describe('cardFromIssue', () => {
  it('ignores an issue that carries no column label for this board', () => {
    expect(cardFromIssue(board, issue({ labels: ['bug'] }))).toBeNull()
    expect(cardFromIssue(board, issue({ labels: ['board:other:status:todo'] }))).toBeNull()
  })

  it('reads the column from the board-prefixed label', () => {
    const card = cardFromIssue(board, issue({ labels: [boardColumnLabel('b1', 'in-progress')] }))
    expect(card?.columnId).toBe('in-progress')
  })

  it('reads priority from labels, defaulting to normal when neither is present', () => {
    expect(cardFromIssue(board, issue())?.priority).toBe('normal')
    const high = issue({ labels: [boardColumnLabel('b1', 'todo'), PRIORITY_LABELS.high.name] })
    expect(cardFromIssue(board, high)?.priority).toBe('high')
    const low = issue({ labels: [boardColumnLabel('b1', 'todo'), PRIORITY_LABELS.low.name] })
    expect(cardFromIssue(board, low)?.priority).toBe('low')
  })

  it('maps labels back to the board palette, ignoring labels that are not tags', () => {
    const card = cardFromIssue(
      board,
      issue({ labels: [boardColumnLabel('b1', 'todo'), 'bug', 'good first issue'] })
    )
    expect(card?.tagIds).toEqual(['t-bug'])
  })

  it('takes the first assignee, since a card has a single owner', () => {
    const card = cardFromIssue(board, issue({ assignees: ['ada', 'grace'] }))
    expect(card?.assignee).toBe('ada')
  })

  it('splits description, checklist and metadata out of the issue body', () => {
    const card = cardFromIssue(
      board,
      issue({
        body:
          'Fix it.\n\n## Definition of Done\n\n- [ ] Ship\n\n' +
          '<!-- git-manager:meta {"dueDate":"2026-08-10","blockedReason":"Waiting"} -->',
      })
    )
    expect(card?.description).toBe('Fix it.')
    expect(card?.dod).toBe('- [ ] Ship')
    expect(card?.dueDate).toBe('2026-08-10')
    expect(card?.blockedReason).toBe('Waiting')
  })

  it('leaves comments empty — they are fetched on demand, not with the board', () => {
    expect(cardFromIssue(board, issue({ commentCount: 7 }))?.comments).toEqual([])
  })
})

describe('managedLabelsFor', () => {
  it('emits no priority label for a normal-priority card', () => {
    const labels = managedLabelsFor(board, makeCard({ priority: 'normal' }))
    expect(labels).toEqual([boardColumnLabel('b1', 'todo')])
  })

  it('emits the column, tag, priority and blocked labels a card should carry', () => {
    const card = makeCard({
      columnId: 'done',
      tagIds: ['t-bug', 't-ui'],
      priority: 'high',
      blockedReason: 'Waiting on API',
    })
    expect(managedLabelsFor(board, card)).toEqual([
      boardColumnLabel('b1', 'done'),
      'bug',
      'ui',
      PRIORITY_LABELS.high.name,
      BLOCKED_LABEL,
    ])
  })

  it('skips a tag id that is no longer in the board palette', () => {
    const card = makeCard({ tagIds: ['t-bug', 't-deleted'] })
    expect(managedLabelsFor(board, card)).toEqual([boardColumnLabel('b1', 'todo'), 'bug'])
  })
})

describe('isManagedLabel', () => {
  it('claims this board’s column labels, tag names, priorities and blocked', () => {
    expect(isManagedLabel(board, boardColumnLabel('b1', 'todo'))).toBe(true)
    expect(isManagedLabel(board, 'bug')).toBe(true)
    expect(isManagedLabel(board, PRIORITY_LABELS.low.name)).toBe(true)
    expect(isManagedLabel(board, BLOCKED_LABEL)).toBe(true)
  })

  it('disclaims another board’s labels and the repository’s own', () => {
    expect(isManagedLabel(board, 'board:other:status:todo')).toBe(false)
    expect(isManagedLabel(board, 'good first issue')).toBe(false)
  })
})

describe('reconcileLabels', () => {
  it('leaves labels this board does not own alone', () => {
    const { toAdd, toRemove } = reconcileLabels(
      board,
      [boardColumnLabel('b1', 'todo'), 'good first issue', 'board:other:status:done'],
      [boardColumnLabel('b1', 'done')]
    )
    expect(toAdd).toEqual([boardColumnLabel('b1', 'done')])
    // Only the stale column label of *this* board goes.
    expect(toRemove).toEqual([boardColumnLabel('b1', 'todo')])
  })

  it('removes a tag label once the tag is taken off the card', () => {
    const { toAdd, toRemove } = reconcileLabels(
      board,
      [boardColumnLabel('b1', 'todo'), 'bug'],
      [boardColumnLabel('b1', 'todo')]
    )
    expect(toAdd).toEqual([])
    expect(toRemove).toEqual(['bug'])
  })

  it('is a no-op when the issue already carries exactly the right labels', () => {
    const labels = [boardColumnLabel('b1', 'todo'), 'bug']
    expect(reconcileLabels(board, labels, labels)).toEqual({ toAdd: [], toRemove: [] })
  })
})
