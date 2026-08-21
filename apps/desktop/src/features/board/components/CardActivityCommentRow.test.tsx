import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardComment } from '@git-manager/git-types'
import { CardActivityCommentRow } from './CardActivityCommentRow'

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: 'k1',
    author: 'Ada',
    body: '**bold** point',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

describe('CardActivityCommentRow', () => {
  it('renders the author, date and markdown body', () => {
    render(<CardActivityCommentRow comment={comment()} repoPath="/repo" />)
    expect(screen.getByTestId('card-comment-k1')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('offers no way to edit or delete a comment, only to reply — comments are append-only', () => {
    render(<CardActivityCommentRow comment={comment()} repoPath="/repo" />)
    expect(screen.getByTestId('card-comment-k1').querySelectorAll('button')).toHaveLength(0)
  })

  it('renders a reply button and invokes onReply when clicked', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    render(<CardActivityCommentRow comment={comment()} repoPath="/repo" onReply={onReply} />)

    const buttons = screen.getByTestId('card-comment-k1').querySelectorAll('button')
    expect(buttons).toHaveLength(1)

    await user.click(screen.getByTestId('card-comment-reply-k1'))
    expect(onReply).toHaveBeenCalledTimes(1)
  })
})
