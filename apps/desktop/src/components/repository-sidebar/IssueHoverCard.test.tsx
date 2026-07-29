import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { MockIssue } from '../../app/pull-requests/types'
import { IssueHoverCard } from './IssueHoverCard'

function issue(overrides: Partial<MockIssue> = {}): MockIssue {
  return {
    id: 'gh-issue-12-owner/repo',
    number: 12,
    title: 'Sidebar drops the scroll position',
    repo: 'repo',
    fullName: 'owner/repo',
    url: 'https://github.com/owner/repo/issues/12',
    status: 'open',
    author: 'marie',
    authorAvatar: '',
    assignees: [],
    labels: [],
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    comments: 0,
    thumbsUp: 0,
    ...overrides,
  }
}

describe('IssueHoverCard — heading', () => {
  it('shows the issue number, title and author', () => {
    render(<IssueHoverCard issue={issue()} />)
    expect(screen.getByText('#12')).toBeInTheDocument()
    expect(screen.getByText(/Sidebar drops the scroll position/)).toBeInTheDocument()
    expect(screen.getByText('marie')).toBeInTheDocument()
  })

  it('shows the comment and thumbs-up counts', () => {
    render(<IssueHoverCard issue={issue({ comments: 5, thumbsUp: 3 })} />)
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('hides the thumbs-up count when nobody reacted', () => {
    render(<IssueHoverCard issue={issue({ comments: 5, thumbsUp: 0 })} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})

describe('IssueHoverCard — description', () => {
  it('shows the opening of the body under a Description heading', () => {
    render(<IssueHoverCard issue={issue({ body: 'Scrolling the list then switching tab resets it.' })} />)
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByTestId('issue-hover-card-excerpt')).toHaveTextContent(
      'Scrolling the list then switching tab resets it.'
    )
  })

  // Rendering the body's markup would let one issue's screenshot or table resize the whole card.
  it('reduces the body to prose, dropping code blocks and images', () => {
    render(
      <IssueHoverCard
        issue={issue({ body: 'Repro steps:\n\n```sh\nnpm run dev\n```\n\n![shot](x.png)\n\nThen click.' })}
      />
    )
    const excerpt = screen.getByTestId('issue-hover-card-excerpt')
    expect(excerpt).toHaveTextContent('Repro steps: Then click.')
    expect(excerpt).not.toHaveTextContent('npm run dev')
  })

  it('says so when the issue has no description', () => {
    render(<IssueHoverCard issue={issue({ body: undefined })} />)
    expect(screen.getByText('No description provided.')).toBeInTheDocument()
    expect(screen.queryByTestId('issue-hover-card-excerpt')).not.toBeInTheDocument()
  })

  it('treats a whitespace-only body as no description', () => {
    render(<IssueHoverCard issue={issue({ body: '\n\n   \n' })} />)
    expect(screen.getByText('No description provided.')).toBeInTheDocument()
  })
})

describe('IssueHoverCard — metadata column', () => {
  it('renders the issue view\'s status, assignees and labels sections', () => {
    render(<IssueHoverCard issue={issue()} />)
    expect(screen.getByTestId('issue-hover-card-meta')).toBeInTheDocument()
    expect(screen.getByTestId('issue-hover-status')).toBeInTheDocument()
    expect(screen.getByTestId('issue-hover-assignees')).toBeInTheDocument()
    expect(screen.getByTestId('issue-hover-labels')).toBeInTheDocument()
  })

  // PrSidebarSection draws a bottom divider on every block, which suits the tall panel it was built
  // for but leaves a rule across the bottom of a card that ends there.
  it('strips the last section\'s divider so the column does not end on one', () => {
    render(<IssueHoverCard issue={issue()} />)
    const sections = screen.getByTestId('issue-hover-card-meta').querySelectorAll('section')

    // Asserted on the class, not the computed style: Tailwind is not compiled under jsdom, so
    // every border reads as an empty string there.
    expect(sections.length).toBeGreaterThan(1)
    expect(sections[0]).not.toHaveClass('border-b-0')
    expect(sections[sections.length - 1]).toHaveClass('border-b-0')
  })

  // Read-only: the real sidebar's edit buttons fetch and mutate, which a hover must not do.
  it('offers no edit affordance on any section', () => {
    render(<IssueHoverCard issue={issue({ labels: ['bug'] })} />)
    expect(screen.queryByTestId('issue-hover-status-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('issue-hover-assignees-edit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('issue-hover-labels-edit')).not.toBeInTheDocument()
  })

  it('distinguishes an open issue from a closed one', () => {
    const { rerender } = render(<IssueHoverCard issue={issue({ status: 'open' })} />)
    expect(screen.getByText('Open')).toBeInTheDocument()

    rerender(<IssueHoverCard issue={issue({ status: 'closed' })} />)
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('lists the labels', () => {
    render(<IssueHoverCard issue={issue({ labels: ['bug', 'ui'] })} />)
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText('ui')).toBeInTheDocument()
  })

  it('says so when the issue has no label', () => {
    render(<IssueHoverCard issue={issue({ labels: [] })} />)
    expect(screen.getByText('No labels')).toBeInTheDocument()
  })

  // Beyond six the column would grow unpredictably tall for a transient hover.
  it('collapses labels past the sixth into a +N chip', () => {
    render(<IssueHoverCard issue={issue({ labels: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] })} />)
    expect(screen.getByText('a')).toBeInTheDocument()
    expect(screen.getByText('f')).toBeInTheDocument()
    expect(screen.queryByText('g')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('says the issue is unassigned when it has no assignee', () => {
    render(<IssueHoverCard issue={issue({ assignees: [] })} />)
    expect(screen.getByText('No one assigned')).toBeInTheDocument()
  })

  it('names each assignee, with their avatar, instead of the unassigned note', () => {
    render(
      <IssueHoverCard
        issue={issue({
          assignees: [
            { login: 'marie', avatar: 'https://example.test/m.png' },
            { login: 'bob', avatar: 'https://example.test/b.png' },
          ],
        })}
      />
    )
    expect(screen.queryByText('No one assigned')).not.toBeInTheDocument()
    // Scoped to the section: "marie" is also the author, named in the heading.
    const assignees = within(screen.getByTestId('issue-hover-assignees'))
    expect(assignees.getByTestId('pr-user-marie')).toHaveTextContent('marie')
    expect(assignees.getByTestId('pr-user-bob')).toHaveTextContent('bob')
    expect(assignees.getByAltText('marie')).toHaveAttribute('src', 'https://example.test/m.png')
  })
})
