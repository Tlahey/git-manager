import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { commentMock } = vi.hoisted(() => ({ commentMock: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({ comment: commentMock, pending: false, merge: vi.fn(), submitReview: vi.fn(), error: null }),
}))

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
})
