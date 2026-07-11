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
    const { container } = render(<PullRequestsTab allPRs={[]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('PullRequestsTab — grouping', () => {
  it('hides the Pinned group entirely when nothing is pinned', () => {
    render(<PullRequestsTab allPRs={[makePR()]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading={false} />)
    expect(screen.queryByText('Pinned')).not.toBeInTheDocument()
  })

  it('shows Pinned, Needs my review and Other groups with correct counts', () => {
    const prs = [
      makePR({ id: '1', title: 'Pinned PR' }),
      makePR({ id: '2', title: 'Needs review PR', needsMyReview: true }),
      makePR({ id: '3', title: 'Other PR' }),
    ]
    render(<PullRequestsTab allPRs={prs} pinnedIds={new Set(['1'])} onTogglePin={vi.fn()} loading={false} />)
    expect(screen.getByText('Pinned')).toBeInTheDocument()
    expect(screen.getByText('Pinned PR')).toBeInTheDocument()
    expect(screen.getByText('Needs review PR')).toBeInTheDocument()
    expect(screen.getByText('Other PR')).toBeInTheDocument()
  })

  it('a pinned PR that also needsMyReview only shows in the Pinned group', () => {
    const prs = [makePR({ id: '1', title: 'Pinned and needed', needsMyReview: true })]
    render(<PullRequestsTab allPRs={prs} pinnedIds={new Set(['1'])} onTogglePin={vi.fn()} loading={false} />)
    expect(screen.getAllByText('Pinned and needed')).toHaveLength(1)
    expect(screen.getByText('No PRs waiting for your review')).toBeInTheDocument()
  })

  it('shows empty-state messages for empty needs-review and other groups', () => {
    render(<PullRequestsTab allPRs={[]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading={false} />)
    expect(screen.getByText('No PRs waiting for your review')).toBeInTheDocument()
    expect(screen.getByText('No pull requests')).toBeInTheDocument()
  })
})

describe('PullRequestsTab — collapsing groups', () => {
  it('collapses and expands the Other pull requests group', async () => {
    const user = userEvent.setup()
    render(<PullRequestsTab allPRs={[makePR({ title: 'Collapsible PR' })]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading={false} />)
    expect(screen.getByText('Collapsible PR')).toBeInTheDocument()
    await user.click(screen.getByText('Other pull requests'))
    expect(screen.queryByText('Collapsible PR')).not.toBeInTheDocument()
    await user.click(screen.getByText('Other pull requests'))
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
    render(<PullRequestsTab allPRs={prs} pinnedIds={new Set()} onTogglePin={vi.fn()} loading={false} />)
    await user.type(screen.getByPlaceholderText('Search…'), 'bob')
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })
})

describe('PullRequestsTab — pagination per group', () => {
  it('paginates the "Other" group independently from "Needs my review"', async () => {
    const other = Array.from({ length: 25 }, (_, i) => makePR({ id: `o${i}`, title: `Other PR ${i}` }))
    const needs = [makePR({ id: 'n1', title: 'Only needed PR', needsMyReview: true })]
    const user = userEvent.setup()
    render(<PullRequestsTab allPRs={[...other, ...needs]} pinnedIds={new Set()} onTogglePin={vi.fn()} loading={false} />)
    expect(screen.getByText('Only needed PR')).toBeInTheDocument()
    expect(screen.getByText('Load more (5 remaining)')).toBeInTheDocument()
    expect(screen.queryByText('Other PR 24')).not.toBeInTheDocument()

    await user.click(screen.getByText('Load more (5 remaining)'))
    expect(screen.getByText('Other PR 24')).toBeInTheDocument()
  })
})

describe('PullRequestsTab — pin toggling', () => {
  it('forwards onTogglePin from a row in the Other group', async () => {
    const onTogglePin = vi.fn()
    const user = userEvent.setup()
    render(<PullRequestsTab allPRs={[makePR({ id: 'pr-1' })]} pinnedIds={new Set()} onTogglePin={onTogglePin} loading={false} />)
    await user.click(screen.getByTitle('Pin'))
    expect(onTogglePin).toHaveBeenCalledWith('pr-1')
  })
})
