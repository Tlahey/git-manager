import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PullRequest } from '@git-manager/git-types'
import type { PrReviewSummary } from '../../api/github.api'
import { renderWithLanguage } from '../../test/i18n'
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

describe('PrHoverCard — timeline', () => {
  // Frozen so the relative wording is deterministic: 18 minutes before "now" for the opening,
  // 2 hours for the last update.
  const NOW = new Date('2026-07-29T12:00:00Z')
  const CREATED = '2026-07-29T11:42:00Z'
  const UPDATED = '2026-07-29T10:00:00Z'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function renderTimeline(overrides: Partial<PullRequest> = {}) {
    return render(
      <PrHoverCard
        pr={pr({ createdAt: CREATED, updatedAt: UPDATED, ...overrides })}
        summary={summary()}
        isLoading={false}
      />
    )
  }

  it('dates the opening, with the elapsed time beside it', () => {
    renderTimeline()
    const row = screen.getByTestId('pr-hover-card-opened')
    expect(row).toHaveTextContent('Opened')
    expect(row).toHaveTextContent(new Date(CREATED).toLocaleString('en'))
    expect(row).toHaveTextContent('(18 minutes ago)')
  })

  it('dates the last update the same way, below it', () => {
    renderTimeline()
    const row = screen.getByTestId('pr-hover-card-updated')
    expect(row).toHaveTextContent('Updated')
    expect(row).toHaveTextContent(new Date(UPDATED).toLocaleString('en'))
    expect(row).toHaveTextContent('(2 hours ago)')
  })

  it('translates both the label and the elapsed time', () => {
    renderWithLanguage(
      <PrHoverCard
        pr={pr({ createdAt: CREATED, updatedAt: UPDATED })}
        summary={summary()}
        isLoading={false}
      />,
      'fr'
    )
    const row = screen.getByTestId('pr-hover-card-opened')
    expect(row).toHaveTextContent('Ouverte le')
    expect(row).toHaveTextContent('(il y a 18 minutes)')
  })

  // GitHub sending nothing usable must not render "Invalid Date".
  it('drops a line whose timestamp is missing or unparseable', () => {
    renderTimeline({ createdAt: '', updatedAt: 'not-a-date' })
    expect(screen.queryByTestId('pr-hover-card-opened')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pr-hover-card-updated')).not.toBeInTheDocument()
  })

  // The block carries a top border, so an empty one is a rule across the card separating nothing
  // from nothing. One border survives here: the review block, which has a summary to show.
  it('drops the whole block, divider included, when neither date is usable', () => {
    const withDates = renderTimeline()
    expect(withDates.container.querySelectorAll('.border-t')).toHaveLength(2)
    withDates.unmount()

    const { container } = renderTimeline({ createdAt: '', updatedAt: '' })
    expect(container.querySelectorAll('.border-t')).toHaveLength(1)
  })

  it('keeps the block when only one of the two dates is usable', () => {
    renderTimeline({ createdAt: CREATED, updatedAt: '' })
    expect(screen.getByTestId('pr-hover-card-opened')).toBeInTheDocument()
    expect(screen.queryByTestId('pr-hover-card-updated')).not.toBeInTheDocument()
  })
})

describe('PrHoverCard — empty review block', () => {
  // Routine, not an edge case: the lookup is off whenever there is no repo path, no GitHub token,
  // or the request failed — and an empty bordered block is a divider at the bottom of the card.
  it('draws no review block at all when the lookup produced nothing', () => {
    const { container } = render(
      <PrHoverCard pr={pr({ createdAt: '', updatedAt: '' })} summary={undefined} isLoading={false} />
    )
    expect(container.querySelectorAll('.border-t')).toHaveLength(0)
    expect(screen.queryByText('Loading review status…')).not.toBeInTheDocument()
  })

  it('still draws it while the lookup is in flight', () => {
    render(<PrHoverCard pr={pr()} summary={undefined} isLoading />)
    expect(screen.getByText('Loading review status…')).toBeInTheDocument()
  })

  it('still draws it once a summary arrives, even an empty one', () => {
    render(<PrHoverCard pr={pr()} summary={summary()} isLoading={false} />)
    expect(screen.getByText('No reviewer requested')).toBeInTheDocument()
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
