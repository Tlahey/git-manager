import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PrReviewerList } from './PrReviewerList'

describe('PrReviewerList', () => {
  it('shows each reviewer with the verdict they left', () => {
    render(
      <PrReviewerList
        reviewers={[
          { login: 'alice', avatarUrl: '', state: 'APPROVED' },
          { login: 'bob', avatarUrl: '', state: 'CHANGES_REQUESTED' },
          { login: 'carol', avatarUrl: '', state: 'COMMENTED' },
          { login: 'dave', avatarUrl: '', state: 'PENDING' },
        ]}
        emptyLabel="pr.side.noReviewers"
      />
    )

    expect(screen.getByTestId('pr-reviewer-alice')).toHaveTextContent('Approved')
    expect(screen.getByTestId('pr-reviewer-bob')).toHaveTextContent('Changes requested')
    expect(screen.getByTestId('pr-reviewer-carol')).toHaveTextContent('Commented')
    expect(screen.getByTestId('pr-reviewer-dave')).toHaveTextContent('Pending')
  })

  it('renders an avatar for a reviewer that has one', () => {
    render(
      <PrReviewerList
        reviewers={[{ login: 'alice', avatarUrl: 'https://example.test/a.png', state: 'APPROVED' }]}
        emptyLabel="pr.side.noReviewers"
      />
    )

    expect(within(screen.getByTestId('pr-reviewer-alice')).getByAltText('alice')).toHaveAttribute(
      'src',
      'https://example.test/a.png'
    )
  })

  it('falls back to the empty label when there is no reviewer', () => {
    render(<PrReviewerList reviewers={[]} emptyLabel="pr.side.noReviewers" />)

    expect(screen.getByText('No reviewers yet')).toBeInTheDocument()
  })
})
