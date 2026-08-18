import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardComment } from '@git-manager/git-types'
import { CardActivityCommentThread } from './CardActivityCommentThread'
import type { CommentThreadNode } from '../lib/commentThreads'

function comment(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    id: 'k1',
    author: 'Ada',
    body: 'Looks good',
    createdAt: '2026-08-01T09:00:00.000Z',
    ...overrides,
  }
}

function node(comment: BoardComment, children: CommentThreadNode[] = []): CommentThreadNode {
  return { comment, children }
}

describe('CardActivityCommentThread', () => {
  it('renders a node and its nested children', () => {
    const tree = node(comment({ id: 'p1' }), [
      node(comment({ id: 'r1', author: 'Grace' }), [node(comment({ id: 'r2', author: 'Bob' }))]),
    ])

    render(
      <ul>
        <CardActivityCommentThread
          node={tree}
          depth={0}
          repoPath="/repo"
          repliesEnabled
          onReply={vi.fn()}
        />
      </ul>
    )

    expect(screen.getByTestId('card-comment-p1')).toBeInTheDocument()
    expect(screen.getByTestId('card-comment-r1')).toBeInTheDocument()
    expect(screen.getByTestId('card-comment-r2')).toBeInTheDocument()
  })

  it('indents children further than their parent, capped past the max depth', () => {
    const tree = node(comment({ id: 'p1' }), [node(comment({ id: 'r1' }))])

    render(
      <ul>
        <CardActivityCommentThread
          node={tree}
          depth={7}
          repoPath="/repo"
          repliesEnabled
          onReply={vi.fn()}
        />
      </ul>
    )

    // `CardActivityCommentRow` renders its own `<li>`; the indent lives one level up, on the `<li>`
    // `CardActivityCommentThread` wraps it in — hence `.parentElement` rather than `.closest('li')`,
    // which would match the row's own `<li>` first.
    const parentLi = screen.getByTestId('card-comment-p1').parentElement
    const childLi = screen.getByTestId('card-comment-r1').parentElement
    // depth 7 is past MAX_INDENT_DEPTH (6), so the parent's own indent is already capped.
    expect(parentLi).toHaveStyle({ marginLeft: '84px' })
    // The child is one level deeper (8) but stays capped at the same maximum.
    expect(childLi).toHaveStyle({ marginLeft: '84px' })
  })

  it('renders no reply buttons anywhere in the tree when repliesEnabled is false', async () => {
    const user = userEvent.setup()
    const onReply = vi.fn()
    const tree = node(comment({ id: 'p1' }), [node(comment({ id: 'r1' }))])

    render(
      <ul>
        <CardActivityCommentThread
          node={tree}
          depth={0}
          repoPath="/repo"
          repliesEnabled={false}
          onReply={onReply}
        />
      </ul>
    )

    expect(screen.queryByTestId('card-comment-reply-p1')).not.toBeInTheDocument()
    expect(screen.queryByTestId('card-comment-reply-r1')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('card-comment-p1'))
    expect(onReply).not.toHaveBeenCalled()
  })
})
