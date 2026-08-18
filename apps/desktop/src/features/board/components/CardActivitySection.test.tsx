import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardColumn, BoardComment, BoardTag, CardHistoryEntry } from '@git-manager/git-types'
import { CardActivitySection } from './CardActivitySection'

vi.mock('../api/attachment.api', () => ({ saveBoardAttachment: vi.fn() }))

const columns: BoardColumn[] = [{ id: 'done', name: 'Done', order: 0 }]
const tags: BoardTag[] = []

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: 'k1',
    author: 'Ada',
    body: 'Looks good to me',
    createdAt: '2020-01-01T09:00:00.000Z',
    ...overrides,
  }
}

function entry(overrides: Partial<CardHistoryEntry> = {}): CardHistoryEntry {
  return {
    oid: 'abc1234567',
    shortOid: 'abc1234',
    authorName: 'Grace',
    authorEmail: 'grace@example.com',
    timestamp: 1_800_000_000, // 2027 — after the comment above, so it sorts first
    kind: 'updated',
    changes: [{ field: 'columnId', oldValue: 'todo', newValue: 'done' }],
    ...overrides,
  }
}

function renderSection(props: Partial<React.ComponentProps<typeof CardActivitySection>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(
    <CardActivitySection
      comments={[]}
      onSubmit={onSubmit}
      repoPath="/repo"
      columns={columns}
      tags={tags}
      {...props}
    />
  )
  return onSubmit
}

describe('CardActivitySection', () => {
  it('shows no tabs for a remote card, which has no history to walk', () => {
    renderSection({ comments: [comment()] })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByTestId('card-comment-k1')).toBeInTheDocument()
  })

  it('shows the three tabs once history is available, even if empty', () => {
    renderSection({ history: [] })
    expect(screen.getByTestId('card-activity-tab-all')).toBeInTheDocument()
    expect(screen.getByTestId('card-activity-tab-comments')).toBeInTheDocument()
    expect(screen.getByTestId('card-activity-tab-history')).toBeInTheDocument()
  })

  it('interleaves comments and history entries on the All tab, newest first', () => {
    renderSection({ comments: [comment()], history: [entry()] })
    // Scoped to top-level activity rows: `card-comment-input`/`-submit` share the `card-comment-`
    // prefix but aren't rows, and a history row's own field changes are nested `<li>`s with no
    // testid of their own.
    const rows = screen
      .getAllByRole('listitem')
      .filter((r) => /^card-(comment-k|history-entry-)/.test(r.dataset.testid ?? ''))
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      'card-history-entry-abc1234',
      'card-comment-k1',
    ])
  })

  it('filters to only comments on the Comments tab', async () => {
    renderSection({ comments: [comment()], history: [entry()] })
    await userEvent.click(screen.getByTestId('card-activity-tab-comments'))
    expect(screen.getByTestId('card-comment-k1')).toBeInTheDocument()
    expect(screen.queryByTestId('card-history-entry-abc1234')).not.toBeInTheDocument()
  })

  it('filters to only history on the History tab, and hides the comment composer', async () => {
    renderSection({ comments: [comment()], history: [entry()] })
    await userEvent.click(screen.getByTestId('card-activity-tab-history'))
    expect(screen.getByTestId('card-history-entry-abc1234')).toBeInTheDocument()
    expect(screen.queryByTestId('card-comment-k1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-comment-input')).not.toBeInTheDocument()
  })

  it('shows the composer on the All and Comments tabs', () => {
    renderSection({ history: [] })
    expect(screen.getByTestId('card-comment-input')).toBeInTheDocument()
  })

  it('shows a tab-specific empty state', async () => {
    renderSection({ history: [] })
    expect(screen.getByText('No activity yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('card-activity-tab-history'))
    expect(screen.getByText('No changes yet.')).toBeInTheDocument()
  })

  it('posts a new comment and clears the box', async () => {
    const onSubmit = renderSection({ history: [] })
    await userEvent.type(screen.getByTestId('card-comment-input'), 'Nice work')
    await userEvent.click(screen.getByTestId('card-comment-submit'))
    expect(onSubmit).toHaveBeenCalledWith('Nice work')
    await waitFor(() => expect(screen.getByTestId('card-comment-input')).toHaveValue(''))
  })

  it('counts every item, comments and history together', () => {
    renderSection({ comments: [comment()], history: [entry()] })
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})
