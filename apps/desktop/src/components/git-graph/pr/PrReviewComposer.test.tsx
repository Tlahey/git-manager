import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@git-manager/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const { submitReviewMock } = vi.hoisted(() => ({ submitReviewMock: vi.fn() }))
vi.mock('../../../hooks/usePrActions', () => ({
  usePrActions: () => ({
    submitReview: submitReviewMock,
    pending: false,
    comment: vi.fn(),
    merge: vi.fn(),
    error: null,
  }),
}))

import { PrReviewComposer } from './PrReviewComposer'

beforeEach(() => {
  vi.clearAllMocks()
  submitReviewMock.mockResolvedValue(undefined)
})

describe('PrReviewComposer', () => {
  it('submits an approval with the review body', async () => {
    const user = userEvent.setup()
    render(<PrReviewComposer repoPath="/repo" prNumber={7} />)
    await user.type(screen.getByTestId('pr-review-input'), 'nice work')
    await user.click(screen.getByTestId('pr-review-approve'))
    expect(submitReviewMock).toHaveBeenCalledWith({ event: 'APPROVE', body: 'nice work' })
  })

  it('submits request-changes without a body as undefined', async () => {
    const user = userEvent.setup()
    render(<PrReviewComposer repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('pr-review-request-changes'))
    expect(submitReviewMock).toHaveBeenCalledWith({ event: 'REQUEST_CHANGES', body: undefined })
  })

  it('submits a plain comment review', async () => {
    const user = userEvent.setup()
    render(<PrReviewComposer repoPath="/repo" prNumber={7} />)
    await user.click(screen.getByTestId('pr-review-comment'))
    expect(submitReviewMock).toHaveBeenCalledWith({ event: 'COMMENT', body: undefined })
  })
})
