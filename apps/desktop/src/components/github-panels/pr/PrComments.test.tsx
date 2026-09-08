import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const usePrComments = vi.fn()
vi.mock('../../../hooks/usePrComments', () => ({
  usePrComments: (...a: unknown[]) => usePrComments(...a),
}))

import { PrComments } from './PrComments'

const refresh = vi.fn()

const entry = (over: Record<string, unknown> = {}) => ({
  id: 1,
  key: 'comment-1',
  body: 'Looks good',
  html_url: '',
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  user: { login: 'octocat', avatar_url: 'https://x/o.png' },
  ...over,
})

beforeEach(() => {
  refresh.mockReset()
  usePrComments.mockReturnValue({ comments: [], isLoading: false, error: null, refresh })
})

describe('PrComments', () => {
  it('asks for reviews only when the caller opts in', () => {
    const { rerender } = render(<PrComments repoPath="/repo" prNumber={7} />)
    expect(usePrComments).toHaveBeenLastCalledWith('/repo', 7, { withReviews: false })

    rerender(<PrComments repoPath="/repo" prNumber={7} withReviews />)
    expect(usePrComments).toHaveBeenLastCalledWith('/repo', 7, { withReviews: true })
  })

  it('shows the empty state when the conversation has nothing in it', () => {
    render(<PrComments repoPath="/repo" prNumber={7} />)
    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
  })

  it('renders each entry with its author and markdown body', () => {
    usePrComments.mockReturnValue({
      comments: [entry({ body: '**bold**' })],
      isLoading: false,
      error: null,
      refresh,
    })

    render(<PrComments repoPath="/repo" prNumber={7} />)

    expect(screen.getByTestId('pr-comment-comment-1')).toBeInTheDocument()
    expect(screen.getByText('octocat')).toBeInTheDocument()
    expect(screen.getByText('bold').tagName).toBe('STRONG')
    expect(screen.queryByTestId('pr-comment-review-state-comment-1')).not.toBeInTheDocument()
  })

  it("labels a submitted review with its verdict, so a bot's report reads as a review", () => {
    usePrComments.mockReturnValue({
      comments: [
        entry({ id: 9, key: 'review-9', body: 'Copilot reviewed 12 files.' }),
        entry({ id: 8, key: 'review-8', reviewState: 'APPROVED', body: 'LGTM' }),
        entry({ id: 7, key: 'review-7', reviewState: 'CHANGES_REQUESTED', body: 'Nope' }),
      ],
      isLoading: false,
      error: null,
      refresh,
    })

    render(<PrComments repoPath="/repo" prNumber={7} withReviews />)

    expect(screen.queryByTestId('pr-comment-review-state-review-9')).not.toBeInTheDocument()
    expect(screen.getByTestId('pr-comment-review-state-review-8')).toHaveTextContent('Approved')
    expect(screen.getByTestId('pr-comment-review-state-review-7')).toHaveTextContent(
      'Changes requested'
    )
  })

  it('refreshes the conversation on demand', async () => {
    const user = userEvent.setup()
    render(<PrComments repoPath="/repo" prNumber={7} />)

    await user.click(screen.getByTestId('pr-comments-refresh'))

    expect(refresh).toHaveBeenCalledOnce()
  })
})
