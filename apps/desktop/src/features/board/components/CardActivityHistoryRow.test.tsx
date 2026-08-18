import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BoardColumn, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { CardActivityHistoryRow } from './CardActivityHistoryRow'

const columns: BoardColumn[] = [{ id: 'done', name: 'Done', order: 0 }]
const tags: BoardTag[] = []

function entry(overrides: Partial<CardHistoryEntry> = {}): CardHistoryEntry {
  return {
    oid: 'abc1234567',
    shortOid: 'abc1234',
    authorName: 'Ada',
    authorEmail: 'ada@example.com',
    timestamp: 1_700_000_000,
    kind: 'updated',
    changes: [{ field: 'columnId', oldValue: 'todo', newValue: 'done' }],
    ...overrides,
  }
}

describe('CardActivityHistoryRow', () => {
  it('renders a creation entry without a before/after list', () => {
    render(
      <CardActivityHistoryRow
        entry={entry({ kind: 'created', changes: [] })}
        columns={columns}
        tags={tags}
      />
    )
    expect(screen.getByText('Card created')).toBeInTheDocument()
  })

  it('renders the field label and a before/after pair, resolving the column id to its name', () => {
    render(<CardActivityHistoryRow entry={entry()} columns={columns} tags={tags} />)
    expect(screen.getByTestId('card-history-entry-abc1234')).toBeInTheDocument()
    expect(screen.getByText('Column')).toBeInTheDocument()
    expect(screen.getByText('todo')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders every field change of one commit, not just the first', () => {
    render(
      <CardActivityHistoryRow
        entry={entry({
          changes: [
            { field: 'priority', oldValue: 'normal', newValue: 'high' },
            { field: 'assignee', newValue: 'ada' },
          ],
        })}
        columns={columns}
        tags={tags}
      />
    )
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByText('Assignee')).toBeInTheDocument()
    expect(screen.getByText('ada')).toBeInTheDocument()
  })

  it('shows a note instead of a before/after pair for a free-text field', () => {
    render(
      <CardActivityHistoryRow
        entry={entry({ changes: [{ field: 'description' }] })}
        columns={columns}
        tags={tags}
      />
    )
    expect(screen.getByText('Description updated')).toBeInTheDocument()
  })

  it('shows author and date on every entry', () => {
    render(<CardActivityHistoryRow entry={entry()} columns={columns} tags={tags} />)
    expect(screen.getByText('Ada')).toBeInTheDocument()
  })
})
