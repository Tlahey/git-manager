import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../types'

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }))

import { WaitingForReviewTab } from './WaitingForReviewTab'

function makePR(overrides: Partial<MockPR> = {}): MockPR {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'A pull request',
    repo: 'repo-a',
    repoUrl: 'x',
    url: 'https://x/pull/1',
    status: 'open',
    ciStatus: null,
    author: 'alice',
    authorAvatar: 'x',
    collaborators: [],
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    reviewStatus: 'pending',
    isDraft: false,
    needsMyReview: true,
    labels: [],
    comments: 0,
    ...overrides,
  }
}

describe('WaitingForReviewTab — loading', () => {
  it('shows skeleton rows while loading', () => {
    const { container } = render(
      <WaitingForReviewTab allPRs={[]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading />
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('WaitingForReviewTab — filtering to needsMyReview', () => {
  it('only shows PRs where needsMyReview is true', () => {
    const prs = [
      makePR({ id: '1', title: 'Needs review', needsMyReview: true }),
      makePR({ id: '2', title: 'Not for me', needsMyReview: false }),
    ]
    render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText('Needs review')).toBeInTheDocument()
    expect(screen.queryByText('Not for me')).not.toBeInTheDocument()
  })

  it('shows an empty state when nothing needs review', () => {
    const prs = [makePR({ needsMyReview: false })]
    render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText("You're all caught up")).toBeInTheDocument()
  })
})

describe('WaitingForReviewTab — search and filters', () => {
  it('filters by search text across title/author/repo', async () => {
    const prs = [
      makePR({ id: '1', title: 'Fix bug', author: 'alice', repo: 'repo-a' }),
      makePR({ id: '2', title: 'Add feature', author: 'bob', repo: 'repo-b' }),
    ]
    const user = userEvent.setup()
    render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    await user.type(screen.getByPlaceholderText('Search…'), 'bob')
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })

  it('filters by repo via the Repo dropdown', async () => {
    const prs = [
      makePR({ id: '1', title: 'From repo A', repo: 'repo-a' }),
      makePR({ id: '2', title: 'From repo B', repo: 'repo-b' }),
    ]
    const user = userEvent.setup()
    const { container } = render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    await user.click(screen.getAllByText('Repo')[0])
    // "repo-a" also appears in the PRRow's own repo column, so scope the click to the dropdown popup.
    const dropdown = container.querySelector<HTMLElement>('.absolute.left-0.top-full')!
    await user.click(within(dropdown).getByText('repo-a'))
    expect(screen.getByText('From repo A')).toBeInTheDocument()
    expect(screen.queryByText('From repo B')).not.toBeInTheDocument()
  })
})

describe('WaitingForReviewTab — sorting', () => {
  it('sorts by author name when the Author sort button is clicked', async () => {
    const prs = [
      makePR({ id: '1', title: 'PR by zed', author: 'zed' }),
      makePR({ id: '2', title: 'PR by alice', author: 'alice' }),
    ]
    const user = userEvent.setup()
    const { container } = render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    const sortButtons = Array.from(container.querySelectorAll('.flex.items-center.gap-1 > button'))
    const authorButton = sortButtons.find((b) => b.textContent === 'Author')!
    await user.click(authorButton) // desc by author: zed before alice
    let titles = Array.from(container.querySelectorAll('.text-xs.font-medium.text-foreground')).map(
      (el) => el.textContent
    )
    expect(titles).toEqual(['PR by zed', 'PR by alice'])

    await user.click(authorButton) // toggled to asc: alice before zed
    titles = Array.from(container.querySelectorAll('.text-xs.font-medium.text-foreground')).map(
      (el) => el.textContent
    )
    expect(titles).toEqual(['PR by alice', 'PR by zed'])
  })
})

describe('WaitingForReviewTab — pagination', () => {
  it('shows a Load more button when there are more than 20 PRs, and loads more on click', async () => {
    const prs = Array.from({ length: 25 }, (_, i) =>
      makePR({ id: String(i), title: `PR number ${i}` })
    )
    const user = userEvent.setup()
    render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText('Load more (5 remaining)')).toBeInTheDocument()
    expect(screen.queryByText('PR number 24')).not.toBeInTheDocument()

    await user.click(screen.getByText('Load more (5 remaining)'))
    expect(screen.getByText('PR number 24')).toBeInTheDocument()
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('hides Load more when there are 20 or fewer PRs', () => {
    const prs = Array.from({ length: 5 }, (_, i) =>
      makePR({ id: String(i), title: `PR number ${i}` })
    )
    render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.queryByText(/Load more/)).not.toBeInTheDocument()
  })
})

describe('WaitingForReviewTab — pin toggling', () => {
  it('passes pinned state and forwards onTogglePin from PRRow', async () => {
    const onTogglePin = vi.fn()
    const prs = [makePR({ id: 'pr-1', title: 'Pinnable PR' })]
    const user = userEvent.setup()
    render(
      <WaitingForReviewTab
        allPRs={prs}
        pinnedIds={new Set(['pr-1'])}
        onTogglePin={onTogglePin}
        loading={false}
      />
    )
    expect(screen.getByTitle('Unpin')).toBeInTheDocument()
    await user.click(screen.getByTitle('Unpin'))
    expect(onTogglePin).toHaveBeenCalledWith('pr-1')
  })
})
