import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockIssue } from '../types'

/** Simulate the infinite-scroll sentinel scrolling into view (see the IntersectionObserver stub in
 * vitest.setup.ts). The most recently mounted observer belongs to the current sentinel. */
function scrollSentinelIntoView() {
  const io = (globalThis.IntersectionObserver as unknown as { instances: { trigger: () => void }[] })
    .instances
  act(() => io.at(-1)?.trigger())
}

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
    thumbsUp: 0,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    comments: 0,
    ...overrides,
  }
}

describe('IssuesTab — loading', () => {
  it('shows skeleton rows while loading', () => {
    const { container } = render(<IssuesTab allIssues={[]} loading currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('IssuesTab — empty state', () => {
  it('shows a no-issues message when the list is empty', () => {
    render(<IssuesTab allIssues={[]} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    expect(screen.getByText('No issues match your filters')).toBeInTheDocument()
  })
})

describe('IssuesTab — content', () => {
  it('lists all issues', () => {
    const issues = [
      makeIssue({ id: '1', title: 'Issue one' }),
      makeIssue({ id: '2', title: 'Issue two' }),
    ]
    render(<IssuesTab allIssues={issues} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
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
    render(<IssuesTab allIssues={issues} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    await user.type(screen.getByPlaceholderText('Search…'), 'bob')
    expect(screen.getByText('Add feature')).toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })

  it('defaults to open issues and reveals closed ones via the Status dropdown', async () => {
    const issues = [
      makeIssue({ id: '1', title: 'Open issue', status: 'open' }),
      makeIssue({ id: '2', title: 'Closed issue', status: 'closed' }),
    ]
    const user = userEvent.setup()
    const { container } = render(<IssuesTab allIssues={issues} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    // Closed issues are hidden by default so the list matches the "open issues" count.
    expect(screen.getByText('Open issue')).toBeInTheDocument()
    expect(screen.queryByText('Closed issue')).not.toBeInTheDocument()

    // Toggling `closed` on brings them back (the status filter, not a separate tab).
    await user.click(screen.getAllByText('Status')[0])
    const dropdown = container.querySelector<HTMLElement>('.absolute.left-0.top-full')!
    await user.click(within(dropdown).getByText('closed'))
    expect(screen.getByText('Open issue')).toBeInTheDocument()
    expect(screen.getByText('Closed issue')).toBeInTheDocument()
  })
})

describe('IssuesTab — mine filter', () => {
  it('defaults to my issues and reveals the rest when the Mine toggle is turned off', async () => {
    const issues = [
      makeIssue({ id: '1', title: 'My issue', author: 'me' }),
      makeIssue({ id: '2', title: 'Someone else issue', author: 'other' }),
      makeIssue({
        id: '3',
        title: 'Assigned to me',
        author: 'other',
        assignees: [{ login: 'me', avatar: 'x' }],
      }),
    ]
    const user = userEvent.setup()
    render(<IssuesTab allIssues={issues} loading={false} currentUser="me" pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    // Default: authored-by-me and assigned-to-me only.
    expect(screen.getByText('My issue')).toBeInTheDocument()
    expect(screen.getByText('Assigned to me')).toBeInTheDocument()
    expect(screen.queryByText('Someone else issue')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('issues-mine-toggle'))
    expect(screen.getByText('Someone else issue')).toBeInTheDocument()
  })

  it('does not render the Mine toggle without a signed-in user', () => {
    render(<IssuesTab allIssues={[]} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    expect(screen.queryByTestId('issues-mine-toggle')).not.toBeInTheDocument()
  })
})

describe('IssuesTab — sorting', () => {
  it('sorts by author name when the Author sort button is clicked', async () => {
    const issues = [
      makeIssue({ id: '1', title: 'Issue by zed', author: 'zed' }),
      makeIssue({ id: '2', title: 'Issue by alice', author: 'alice' }),
    ]
    const user = userEvent.setup()
    const { container } = render(<IssuesTab allIssues={issues} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    const sortButtons = Array.from(container.querySelectorAll('.flex.items-center.gap-1 > button'))
    const authorButton = sortButtons.find((b) => b.textContent === 'Author')!
    await user.click(authorButton) // desc by author: zed before alice
    let titles = Array.from(container.querySelectorAll('.text-xs.font-medium.text-foreground')).map(
      (el) => el.textContent
    )
    expect(titles).toEqual(['Issue by zed', 'Issue by alice'])

    await user.click(authorButton) // asc: alice before zed
    titles = Array.from(container.querySelectorAll('.text-xs.font-medium.text-foreground')).map(
      (el) => el.textContent
    )
    expect(titles).toEqual(['Issue by alice', 'Issue by zed'])
  })
})

describe('IssuesTab — pagination (infinite scroll)', () => {
  it('shows 50 by default and lazy-loads more when the sentinel scrolls into view', () => {
    const issues = Array.from({ length: 60 }, (_, i) =>
      makeIssue({ id: String(i), title: `Issue number ${i}` })
    )
    render(<IssuesTab allIssues={issues} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    // First 50 rendered (stable order — all share an updatedAt), the rest hidden until scroll.
    expect(screen.getByText('Issue number 49')).toBeInTheDocument()
    expect(screen.queryByText('Issue number 55')).not.toBeInTheDocument()
    expect(screen.getByTestId('infinite-scroll-sentinel')).toBeInTheDocument()

    scrollSentinelIntoView()
    expect(screen.getByText('Issue number 55')).toBeInTheDocument()
  })

  it('renders no sentinel when everything already fits in the first page', () => {
    const issues = Array.from({ length: 50 }, (_, i) =>
      makeIssue({ id: String(i), title: `Issue number ${i}` })
    )
    render(<IssuesTab allIssues={issues} loading={false} currentUser={null} pinnedIds={new Set()} onTogglePin={vi.fn()} />)
    expect(screen.queryByTestId('infinite-scroll-sentinel')).not.toBeInTheDocument()
  })
})
