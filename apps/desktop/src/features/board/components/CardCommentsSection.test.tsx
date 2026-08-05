import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardComment } from '@git-manager/git-types'
import { CardCommentsSection } from './CardCommentsSection'

vi.mock('../api/attachment.api', () => ({ saveBoardAttachment: vi.fn() }))

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: 'k1',
    author: 'Ada',
    body: 'Looks good to me',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

function renderSection(props: Partial<React.ComponentProps<typeof CardCommentsSection>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<CardCommentsSection comments={[]} onSubmit={onSubmit} repoPath="/repo" {...props} />)
  return onSubmit
}

describe('CardCommentsSection', () => {
  it('shows an empty state when nothing has been said yet', () => {
    renderSection()
    expect(screen.getByTestId('card-comments-empty')).toBeInTheDocument()
  })

  it('renders each comment with its author and markdown body', () => {
    renderSection({ comments: [comment({ body: '**bold** point' })] })
    expect(screen.getByTestId('card-comment-k1')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('reports while a remote card’s thread is loading', () => {
    renderSection({ loading: true })
    expect(screen.getByText('Loading comments…')).toBeInTheDocument()
  })

  it('will not post an empty comment', () => {
    renderSection()
    expect(screen.getByTestId('card-comment-submit')).toBeDisabled()
  })

  it('posts the comment and clears the box', async () => {
    const onSubmit = renderSection()
    await userEvent.type(screen.getByTestId('card-comment-input'), 'Nice work')
    await userEvent.click(screen.getByTestId('card-comment-submit'))

    expect(onSubmit).toHaveBeenCalledWith('Nice work')
    await waitFor(() => expect(screen.getByTestId('card-comment-input')).toHaveValue(''))
  })

  it('trims surrounding whitespace rather than posting it', async () => {
    const onSubmit = renderSection()
    await userEvent.type(screen.getByTestId('card-comment-input'), '  spaced  ')
    await userEvent.click(screen.getByTestId('card-comment-submit'))
    expect(onSubmit).toHaveBeenCalledWith('spaced')
  })

  /** Comments are append-only — a card edit must never be able to rewrite someone else's words. */
  it('offers no way to edit or delete an existing comment', () => {
    renderSection({ comments: [comment()] })
    const entry = screen.getByTestId('card-comment-k1')
    expect(entry.querySelectorAll('button')).toHaveLength(0)
  })
})
