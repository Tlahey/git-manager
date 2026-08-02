import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { commentMock } = vi.hoisted(() => ({ commentMock: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ comment: commentMock, pending: false, merge: vi.fn(), submitReview: vi.fn(), error: null }),
}))

const openUrl = vi.fn()
vi.mock('../../../lib/openUrl', () => ({ openUrl: (...a: unknown[]) => openUrl(...a) }))

import { PrCommentBox } from './PrCommentBox'

beforeEach(() => {
  vi.clearAllMocks()
  commentMock.mockResolvedValue(undefined)
})

describe('PrCommentBox', () => {
  it('disables submit until there is text, then posts the comment', async () => {
    const user = userEvent.setup()
    render(<PrCommentBox repoPath="/repo" prNumber={7} />)
    expect(screen.getByTestId('pr-comment-submit')).toBeDisabled()

    await user.type(screen.getByTestId('pr-comment-input'), 'looks good')
    expect(screen.getByTestId('pr-comment-submit')).toBeEnabled()

    await user.click(screen.getByTestId('pr-comment-submit'))
    expect(commentMock).toHaveBeenCalledWith('looks good')
  })

  it('opens the target on GitHub when an image is dropped, since uploads have no API', () => {
    render(<PrCommentBox repoPath="/repo" prNumber={7} targetUrl="https://github.com/o/r/issues/7" />)

    fireEvent.drop(screen.getByTestId('pr-comment-input'), {
      dataTransfer: { types: ['Files'], files: [{ type: 'image/png' }] } as unknown as DataTransfer,
    })

    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/issues/7')
  })
})
