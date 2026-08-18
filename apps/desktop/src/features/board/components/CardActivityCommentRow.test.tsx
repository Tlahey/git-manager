import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('offers no way to edit or delete a comment — comments are append-only', () => {
    render(<CardActivityCommentRow comment={comment()} repoPath="/repo" />)
    expect(screen.getByTestId('card-comment-k1').querySelectorAll('button')).toHaveLength(0)
  })
})
