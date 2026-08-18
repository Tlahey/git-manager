import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardColumn, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { CardActivityHistoryRow } from './CardActivityHistoryRow'

vi.mock('../../../lib/clipboard', () => ({ copyWithToast: vi.fn() }))
import { copyWithToast } from '../../../lib/clipboard'

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

beforeEach(() => {
  vi.clearAllMocks()
})

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

  it('shows author and date on every entry', () => {
    render(<CardActivityHistoryRow entry={entry()} columns={columns} tags={tags} />)
    expect(screen.getByText('Ada')).toBeInTheDocument()
  })

  describe('a description/DOD change', () => {
    function renderDescriptionChange(oldValue?: string, newValue?: string) {
      render(
        <CardActivityHistoryRow
          entry={entry({ changes: [{ field: 'description', oldValue, newValue }] })}
          columns={columns}
          tags={tags}
        />
      )
    }

    it('shows two columns, Before and After, with the full text', () => {
      renderDescriptionChange('Old copy', 'New copy')
      expect(screen.getByText('Before')).toBeInTheDocument()
      expect(screen.getByText('After')).toBeInTheDocument()
      expect(screen.getByText('Old copy')).toBeInTheDocument()
      expect(screen.getByText('New copy')).toBeInTheDocument()
    })

    it('shows a "None" placeholder for a side that was empty', () => {
      renderDescriptionChange(undefined, 'First draft')
      expect(screen.getByText('None')).toBeInTheDocument()
    })

    it('offers no copy button for the empty side', () => {
      renderDescriptionChange(undefined, 'First draft')
      expect(screen.queryByTestId('card-history-copy-before-abc1234567-0')).not.toBeInTheDocument()
      expect(screen.getByTestId('card-history-copy-after-abc1234567-0')).toBeInTheDocument()
    })

    it('copies the exact previous text when the Before copy button is clicked', async () => {
      renderDescriptionChange('Old copy', 'New copy')
      await userEvent.click(screen.getByTestId('card-history-copy-before-abc1234567-0'))
      expect(copyWithToast).toHaveBeenCalledWith('Old copy', 'text')
    })

    it('copies the new text when the After copy button is clicked', async () => {
      renderDescriptionChange('Old copy', 'New copy')
      await userEvent.click(screen.getByTestId('card-history-copy-after-abc1234567-0'))
      expect(copyWithToast).toHaveBeenCalledWith('New copy', 'text')
    })
  })
})
