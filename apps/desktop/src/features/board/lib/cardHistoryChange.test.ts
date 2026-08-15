import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { BoardColumn, BoardTag, CardFieldChange } from '@git-manager/git-types'
import { formatCardHistoryChange } from './cardHistoryChange'

/** The real English copy, so a wrong or blank key fails here rather than in the UI. */
const t = (key: string, options?: Record<string, unknown>) =>
  i18next.t(key, { ns: 'board', ...options })

const columns: BoardColumn[] = [
  { id: 'todo', name: 'To do', order: 0 },
  { id: 'done', name: 'Done', order: 1, isDone: true },
]
const tags: BoardTag[] = [{ id: 't1', name: 'Urgent', color: '#f00' }]

function change(overrides: Partial<CardFieldChange> & { field: string }): CardFieldChange {
  return { oldValue: undefined, newValue: undefined, ...overrides }
}

function format(c: CardFieldChange): string {
  return formatCardHistoryChange(c, { t, columns, tags })
}

describe('formatCardHistoryChange', () => {
  it('reads a title change as the new title', () => {
    expect(format(change({ field: 'title', oldValue: 'Old', newValue: 'New' }))).toBe(
      'Title changed to "New"'
    )
  })

  it('resolves a column move to the column’s name, not its id', () => {
    expect(format(change({ field: 'columnId', oldValue: 'todo', newValue: 'done' }))).toBe(
      'Moved to Done'
    )
  })

  it('falls back to the raw id when the column no longer exists', () => {
    expect(format(change({ field: 'columnId', newValue: 'gone' }))).toBe('Moved to gone')
  })

  it('routes priority through the same label the rest of the card dialog uses', () => {
    expect(format(change({ field: 'priority', oldValue: 'normal', newValue: 'high' }))).toBe(
      'Priority changed to High'
    )
  })

  it('routes kind through the same label the rest of the card dialog uses', () => {
    expect(format(change({ field: 'kind', oldValue: 'task', newValue: 'bug' }))).toBe(
      'Changed to Bug'
    )
  })

  it('distinguishes an assignment from a clear', () => {
    expect(format(change({ field: 'assignee', newValue: 'ada' }))).toBe('Assigned to ada')
    expect(format(change({ field: 'assignee', oldValue: 'ada' }))).toBe('Unassigned')
  })

  it('distinguishes setting a due date from clearing it', () => {
    expect(format(change({ field: 'dueDate', newValue: '2026-08-20' }))).toBe(
      'Due date set to 2026-08-20'
    )
    expect(format(change({ field: 'dueDate', oldValue: '2026-08-20' }))).toBe('Due date cleared')
  })

  it('distinguishes blocking from unblocking', () => {
    expect(format(change({ field: 'blockedReason', newValue: 'Waiting on review' }))).toBe(
      'Blocked: Waiting on review'
    )
    expect(format(change({ field: 'blockedReason', oldValue: 'Waiting on review' }))).toBe(
      'Unblocked'
    )
  })

  it('distinguishes linking a branch from unlinking one', () => {
    expect(format(change({ field: 'linkedBranch', newValue: 'feature/x' }))).toBe(
      'Linked to branch feature/x'
    )
    expect(format(change({ field: 'linkedBranch', oldValue: 'feature/x' }))).toBe('Branch unlinked')
  })

  it('reads the archived flag off newValue', () => {
    expect(format(change({ field: 'archived', oldValue: 'false', newValue: 'true' }))).toBe(
      'Archived'
    )
    expect(format(change({ field: 'archived', oldValue: 'true', newValue: 'false' }))).toBe(
      'Unarchived'
    )
  })

  it('reports free-text fields as changed without echoing their content', () => {
    expect(format(change({ field: 'description' }))).toBe('Description updated')
    expect(format(change({ field: 'dod' }))).toBe('Definition of Done updated')
  })

  it('resolves tag ids to their names, comma-joined', () => {
    expect(format(change({ field: 'tagIds', newValue: 't1' }))).toBe('Tags changed to Urgent')
  })

  it('shows a new comment’s body', () => {
    expect(format(change({ field: 'comment', newValue: 'Looks good' }))).toBe(
      'Commented: "Looks good"'
    )
  })

  it('falls back to a generic sentence for an unrecognized field', () => {
    expect(format(change({ field: 'somethingNew' }))).toBe('somethingNew updated')
  })
})
