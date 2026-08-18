import { describe, it, expect } from 'vitest'
import { i18next } from '@git-manager/i18n'
import type { BoardColumn, BoardTag, CardFieldChange } from '@git-manager/git-types'
import { describeCardFieldChange } from './cardHistoryChange'

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

function describe_(c: CardFieldChange) {
  return describeCardFieldChange(c, { t, columns, tags })
}

describe('describeCardFieldChange', () => {
  it('reads a title change as a before/after pair', () => {
    expect(describe_(change({ field: 'title', oldValue: 'Old', newValue: 'New' }))).toEqual({
      label: 'Title',
      from: 'Old',
      to: 'New',
    })
  })

  it('resolves a column move to the columns’ names, not their ids', () => {
    expect(describe_(change({ field: 'columnId', oldValue: 'todo', newValue: 'done' }))).toEqual({
      label: 'Column',
      from: 'To do',
      to: 'Done',
    })
  })

  it('falls back to the raw id when a column no longer exists', () => {
    expect(describe_(change({ field: 'columnId', oldValue: 'todo', newValue: 'gone' }))).toEqual({
      label: 'Column',
      from: 'To do',
      to: 'gone',
    })
  })

  it('routes priority through the same label the rest of the card dialog uses', () => {
    expect(describe_(change({ field: 'priority', oldValue: 'normal', newValue: 'high' }))).toEqual({
      label: 'Priority',
      from: 'Normal',
      to: 'High',
    })
  })

  it('routes kind through the same label the rest of the card dialog uses', () => {
    expect(describe_(change({ field: 'kind', oldValue: 'task', newValue: 'bug' }))).toEqual({
      label: 'Type',
      from: 'Task',
      to: 'Bug',
    })
  })

  it('shows "None" for an empty assignee on either side', () => {
    expect(describe_(change({ field: 'assignee', newValue: 'ada' }))).toEqual({
      label: 'Assignee',
      from: 'None',
      to: 'ada',
    })
    expect(describe_(change({ field: 'assignee', oldValue: 'ada' }))).toEqual({
      label: 'Assignee',
      from: 'ada',
      to: 'None',
    })
  })

  it('shows "None" for an empty due date on either side', () => {
    expect(describe_(change({ field: 'dueDate', newValue: '2026-08-20' }))).toEqual({
      label: 'Due date',
      from: 'None',
      to: '2026-08-20',
    })
  })

  it('shows "None" for a cleared blocked reason', () => {
    expect(describe_(change({ field: 'blockedReason', oldValue: 'Waiting on review' }))).toEqual({
      label: 'Blocked reason',
      from: 'Waiting on review',
      to: 'None',
    })
  })

  it('shows "None" for an unlinked branch', () => {
    expect(describe_(change({ field: 'linkedBranch', oldValue: 'feature/x' }))).toEqual({
      label: 'Linked branch',
      from: 'feature/x',
      to: 'None',
    })
  })

  it('reads the archived flag as Yes/No', () => {
    expect(describe_(change({ field: 'archived', oldValue: 'false', newValue: 'true' }))).toEqual({
      label: 'Archived',
      from: 'No',
      to: 'Yes',
    })
  })

  it('resolves tag ids to their names, comma-joined', () => {
    expect(describe_(change({ field: 'tagIds', oldValue: 't1', newValue: '' }))).toEqual({
      label: 'Tags',
      from: 'Urgent',
      to: 'None',
    })
  })

  it('reports free-text fields as a note rather than a value pair', () => {
    expect(describe_(change({ field: 'description' }))).toEqual({
      label: 'Description',
      note: 'Description updated',
    })
    expect(describe_(change({ field: 'dod' }))).toEqual({
      label: 'Definition of Done',
      note: 'Definition of Done updated',
    })
  })

  it('falls back to the raw field name for an unrecognized field', () => {
    expect(describe_(change({ field: 'somethingNew', newValue: 'x' }))).toEqual({
      label: 'somethingNew',
      from: 'None',
      to: 'x',
    })
  })
})
