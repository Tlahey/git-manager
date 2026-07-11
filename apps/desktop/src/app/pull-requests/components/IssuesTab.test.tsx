import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockIssue } from '../types'

vi.mock('@tauri-apps/plugin-shell', () => ({ open: vi.fn() }))

import { IssuesTab } from './IssuesTab'

function makeIssue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: overrides.id ?? Math.random().toString(),
    number: 1,
    title: 'An issue',
    repo: 'repo-a',
    url: 'https://x/issues/1',
    status: 'open',
    author: 'alice',
    authorAvatar: 'x',
    assignees: [],
    labels: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    comments: 0,
    ...overrides,
  }
}

describe('IssuesTab — loading', () => {
  it('shows skeleton rows while loading', () => {
    const { container } = render(<IssuesTab allIssues={[]} loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('IssuesTab — empty state', () => {
  it('shows a no-issues message when the list is empty', () => {
    render(<IssuesTab allIssues={[]} loading={false} />)
    expect(screen.getByText('No issues match your filters')).toBeInTheDocument()
  })
})

describe('IssuesTab — content', () => {
  it('lists all issues', () => {
    const issues = [makeIssue({ id: '1', title: 'Issue one' }), makeIssue({ id: '2', title: 'Issue two' })]
    render(<IssuesTab allIssues={issues} loading={false} />)
    expect(screen.getByText('Issue one')).toBeInTheDocument()
    expect(screen.getByText('Issue two')).toBeInTheDocument()
  })
})

describe('IssuesTab — search and filters', () => {
  it('filters by search text across title/author/number', async () => {
    const issues = [
      makeIssue({ id: '1', title: 'Fix bug', author: 'alice' }),
      makeIssue({ id: '2', title: 'Add feature', author: 'bob' }),
    ]
    const user = userEvent.setup()
    render(<IssuesTab allIssues={issues} loading={false} />)
    await user.type(screen.getByPlaceholderText('Search…'), 'bob')
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })

  it('filters by status via the Status dropdown', async () => {
    const issues = [
      makeIssue({ id: '1', title: 'Open issue', status: 'open' }),
      makeIssue({ id: '2', title: 'Closed issue', status: 'closed' }),
    ]
    const user = userEvent.setup()
    const { container } = render(<IssuesTab allIssues={issues} loading={false} />)
    await user.click(screen.getAllByText('Status')[0])
    const dropdown = container.querySelector<HTMLElement>('.absolute.left-0.top-full')!
    await user.click(within(dropdown).getByText('closed'))
    expect(screen.getByText('Closed issue')).toBeInTheDocument()
    expect(screen.queryByText('Open issue')).not.toBeInTheDocument()
  })
})

describe('IssuesTab — sorting', () => {
  it('sorts by author name when the Author sort button is clicked', async () => {
    const issues = [
      makeIssue({ id: '1', title: 'Issue by zed', author: 'zed' }),
      makeIssue({ id: '2', title: 'Issue by alice', author: 'alice' }),
    ]
    const user = userEvent.setup()
    const { container } = render(<IssuesTab allIssues={issues} loading={false} />)
    const sortButtons = Array.from(container.querySelectorAll('.flex.items-center.gap-1 > button'))
    const authorButton = sortButtons.find((b) => b.textContent === 'Author')!
    await user.click(authorButton) // desc by author: zed before alice
    let titles = Array.from(container.querySelectorAll('.text-xs.font-medium.text-foreground')).map((el) => el.textContent)
    expect(titles).toEqual(['Issue by zed', 'Issue by alice'])

    await user.click(authorButton) // asc: alice before zed
    titles = Array.from(container.querySelectorAll('.text-xs.font-medium.text-foreground')).map((el) => el.textContent)
    expect(titles).toEqual(['Issue by alice', 'Issue by zed'])
  })
})

describe('IssuesTab — pagination', () => {
  it('shows a Load more button beyond 20 issues, and loads more on click', async () => {
    const issues = Array.from({ length: 25 }, (_, i) => makeIssue({ id: String(i), title: `Issue number ${i}` }))
    const user = userEvent.setup()
    render(<IssuesTab allIssues={issues} loading={false} />)
    expect(screen.getByText('Load more (5 remaining)')).toBeInTheDocument()
    expect(screen.queryByText('Issue number 24')).not.toBeInTheDocument()

    await user.click(screen.getByText('Load more (5 remaining)'))
    expect(screen.getByText('Issue number 24')).toBeInTheDocument()
  })

  it('hides Load more with 20 or fewer issues', () => {
    const issues = Array.from({ length: 5 }, (_, i) => makeIssue({ id: String(i), title: `Issue number ${i}` }))
    render(<IssuesTab allIssues={issues} loading={false} />)
    expect(screen.queryByText(/Load more/)).not.toBeInTheDocument()
  })
})
