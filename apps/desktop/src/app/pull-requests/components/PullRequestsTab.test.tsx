import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockPR } from '../types'

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }))

import { PullRequestsTab } from './PullRequestsTab'

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
    labels: [],
    comments: 0,
    ...overrides,
  }
}

describe('PullRequestsTab — loading', () => {
  it('shows skeleton rows while loading', () => {
    const { container } = render(
      <PullRequestsTab allPRs={[]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading />
    )
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('PullRequestsTab — grouping', () => {
  it('hides the Pinned group entirely when nothing is pinned', () => {
    render(
      <PullRequestsTab
        allPRs={[makePR()]}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
  })

  it('sorts PRs into the ready / unassigned / conflicts / review / draft buckets', () => {
    const prs = [
      makePR({ id: '1', title: 'Ready PR', reviewStatus: 'approved' }),
      makePR({ id: '2', title: 'Unassigned PR' }),
      makePR({ id: '3', title: 'Conflict PR', needsRebase: true }),
      makePR({ id: '4', title: 'Review PR', needsMyReview: true }),
      makePR({ id: '5', title: 'Draft PR', isDraft: true }),
    ]
    render(
      <PullRequestsTab
        allPRs={prs}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText('Ready to merge')).toBeInTheDocument()
    expect(screen.getByText('Unassigned reviewers')).toBeInTheDocument()
    expect(screen.getByText('Resolve conflicts')).toBeInTheDocument()
    expect(screen.getByText('Need my review')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()

    expect(screen.getByText('Ready PR')).toBeInTheDocument()
    expect(screen.getByText('Unassigned PR')).toBeInTheDocument()
    expect(screen.getByText('Conflict PR')).toBeInTheDocument()
    expect(screen.getByText('Review PR')).toBeInTheDocument()
    expect(screen.getByText('Draft PR')).toBeInTheDocument()
  })

  it('a pinned PR only shows in the Pinned group, not in a bucket', () => {
    const prs = [makePR({ id: '1', title: 'Pinned and needed', needsMyReview: true })]
    render(
      <PullRequestsTab
        allPRs={prs}
        pinnedIds={new Set(['1'])}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getAllByText('Pinned and needed')).toHaveLength(1)
  })
})

describe('PullRequestsTab — collapsing groups', () => {
  it('collapses and expands a bucket group', async () => {
    const user = userEvent.setup()
    render(
      <PullRequestsTab
        allPRs={[makePR({ title: 'Collapsible PR' })]}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    // A default PR (no draft/conflict/review/approval) lands in "Unassigned reviewers".
    expect(screen.getByText('Collapsible PR')).toBeInTheDocument()
    await user.click(screen.getByText('Unassigned reviewers'))
    expect(screen.queryByText('Collapsible PR')).not.toBeInTheDocument()
    await user.click(screen.getByText('Unassigned reviewers'))
    expect(screen.getByText('Collapsible PR')).toBeInTheDocument()
  })
})

describe('PullRequestsTab — search and filters', () => {
  it('filters by search text across all groups', async () => {
    const prs = [
      makePR({ id: '1', title: 'Fix bug', author: 'alice' }),
      makePR({ id: '2', title: 'Add feature', author: 'bob' }),
    ]
    const user = userEvent.setup()
    render(
      <PullRequestsTab allPRs={prs} pinnedIds={new Set()} onTogglePin={vi.fn()} loading={false} />
    )
    await user.type(screen.getByPlaceholderText('Search…'), 'bob')
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })
})

describe('PullRequestsTab — pagination per group', () => {
  it('paginates a bucket independently', async () => {
    // 25 default PRs all land in the "Unassigned reviewers" bucket (PAGE_SIZE = 20 → 5 remaining).
    const many = Array.from({ length: 25 }, (_, i) =>
      makePR({ id: `u${i}`, title: `Unassigned PR ${i}` })
    )
    const user = userEvent.setup()
    render(
      <PullRequestsTab
        allPRs={many}
        pinnedIds={new Set()}
        onTogglePin={vi.fn()}
        loading={false}
      />
    )
    expect(screen.getByText('Load more (5 remaining)')).toBeInTheDocument()
    expect(screen.queryByText('Unassigned PR 24')).not.toBeInTheDocument()

    await user.click(screen.getByText('Load more (5 remaining)'))
    expect(screen.getByText('Unassigned PR 24')).toBeInTheDocument()
  })
})

describe('PullRequestsTab — pin toggling', () => {
  it('forwards onTogglePin from a row in the Other group', async () => {
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(
      <PullRequestsTab
        allPRs={[makePR({ id: 'pr-1' })]}
        pinnedIds={new Set()}
        onTogglePin={onTogglePin}
        loading={false}
      />
    )
    await user.click(screen.getByTitle('Pin'))
    expect(onTogglePin).toHaveBeenCalledWith('pr-1')
  })
})
