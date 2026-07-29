import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PullRequest } from '@git-manager/git-types'
import type { PrReviewSummary } from '../../api/github.api'
import { PrHoverCard } from './PrHoverCard'

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Add the sidebar hover card',
    body: '',
    state: 'open',
    author: 'antoine',
    authorAvatar: '',
    headRef: 'feat/hover-card',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    assignees: [],
    requestedReviewers: [],
    labels: [],
    ...overrides,
  }
}

function summary(overrides: Partial<PrReviewSummary> = {}): PrReviewSummary {
  return { reviewDecision: null, reviewers: [], checksState: null, ...overrides }
}

describe('PrHoverCard — always-available content', () => {
  it('shows the PR number, title, state and author', () => {
    render(<PrHoverCard pr={pr()} summary={undefined} isLoading={false} />)
    expect(screen.getByText('#42')).toBeInTheDocument()
    expect(screen.getByText(/Add the sidebar hover card/)).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('antoine')).toBeInTheDocument()
  })

  // The merge target is the question a one-line PR row can't answer.
  it('shows which branch merges into which', () => {
    render(<PrHoverCard pr={pr()} summary={undefined} isLoading={false} />)
    expect(screen.getByText('feat/hover-card')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('renders the title and branches while the review data is still loading', () => {
    render(<PrHoverCard pr={pr()} summary={undefined} isLoading />)
    expect(screen.getByText(/Add the sidebar hover card/)).toBeInTheDocument()
    expect(screen.getByText('feat/hover-card')).toBeInTheDocument()
    expect(screen.getByText('Loading review status…')).toBeInTheDocument()
  })
})

describe('PrHoverCard — review data', () => {
  it('shows the overall review decision', () => {
    render(
      <PrHoverCard
        pr={pr()}
        summary={summary({ reviewDecision: 'CHANGES_REQUESTED' })}
        isLoading={false}
      />
    )
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Changes requested')).toBeInTheDocument()
  })

  it('shows the checks rollup', () => {
    render(<PrHoverCard pr={pr()} summary={summary({ checksState: 'FAILURE' })} isLoading={false} />)
    expect(screen.getByText('Checks')).toBeInTheDocument()
    expect(screen.getByText('Failing')).toBeInTheDocument()
  })

  it('lists each reviewer with their verdict', () => {
    render(
      <PrHoverCard
        pr={pr()}
        summary={summary({
          reviewers: [
            { login: 'marie', avatarUrl: '', state: 'APPROVED' },
            { login: 'bob', avatarUrl: '', state: 'PENDING' },
          ],
        })}
        isLoading={false}
      />
    )
    expect(screen.getByText('Reviewers')).toBeInTheDocument()
    expect(screen.getByText('marie')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('says so when no reviewer has been requested', () => {
    render(<PrHoverCard pr={pr()} summary={summary()} isLoading={false} />)
    expect(screen.getByText('No reviewer requested')).toBeInTheDocument()
  })

  it('reports a draft PR as a draft rather than open', () => {
    render(<PrHoverCard pr={pr({ state: 'draft' })} summary={summary()} isLoading={false} />)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })
})
