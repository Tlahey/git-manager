import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BoardColumn, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { CardHistorySection } from './CardHistorySection'

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

function renderSection(props: Partial<React.ComponentProps<typeof CardHistorySection>> = {}) {
  render(<CardHistorySection history={[]} columns={columns} tags={tags} {...props} />)
}

describe('CardHistorySection', () => {
  it('shows an empty state when the card has no recorded history', () => {
    renderSection()
    expect(screen.getByTestId('card-history-empty')).toBeInTheDocument()
  })

  it('reports while history is loading', () => {
    renderSection({ loading: true })
    expect(screen.getByText('Loading history…')).toBeInTheDocument()
  })

  it('renders a creation entry without a change list', () => {
    renderSection({ history: [entry({ kind: 'created', changes: [] })] })
    expect(screen.getByText('Card created')).toBeInTheDocument()
  })

  it('renders each field change of an update, resolving a column id to its name', () => {
    renderSection({ history: [entry()] })
    expect(screen.getByTestId('card-history-entry-abc1234')).toBeInTheDocument()
    expect(screen.getByText('Moved to Done')).toBeInTheDocument()
  })

  it('renders every change in a single commit, not just the first', () => {
    renderSection({
      history: [
        entry({
          changes: [
            { field: 'priority', oldValue: 'normal', newValue: 'high' },
            { field: 'comment', newValue: 'Looks good' },
          ],
        }),
      ],
    })
    expect(screen.getByText('Priority changed to High')).toBeInTheDocument()
    expect(screen.getByText('Commented: "Looks good"')).toBeInTheDocument()
  })

  it('shows how many commits are in the feed', () => {
    renderSection({ history: [entry(), entry({ oid: 'def', shortOid: 'def', kind: 'created' })] })
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
