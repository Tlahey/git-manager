import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MockIssue } from '../../app/pull-requests/types'
import { IssueItem } from './IssueItem'

const { openUrl, hoverExpandLabel } = vi.hoisted(() => ({
  openUrl: vi.fn(),
  hoverExpandLabel: vi.fn(),
}))
vi.mock('../../app/pull-requests/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../app/pull-requests/utils')>()),
  openUrl,
}))
// Spied on, not stubbed out, so the row's title can be asserted to no longer go through it.
vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: (props: { children: React.ReactNode }) => {
    hoverExpandLabel(props)
    return <span>{props.children}</span>
  },
}))

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

beforeEach(() => openUrl.mockClear())

describe('IssueItem — content', () => {
  it('shows the issue number, title and author', () => {
    render(<IssueItem issue={issue()} />)
    expect(screen.getByText('#12')).toBeInTheDocument()
    expect(screen.getByText(/Sidebar drops the scroll position/)).toBeInTheDocument()
    expect(screen.getByText('marie')).toBeInTheDocument()
  })

  it('shows an open issue with a green dot and a closed one with a purple check', () => {
    const { container, rerender } = render(<IssueItem issue={issue({ status: 'open' })} />)
    expect(container.querySelector('.lucide-circle-dot.text-green-400')).toBeTruthy()

    rerender(<IssueItem issue={issue({ status: 'closed' })} />)
    expect(container.querySelector('.lucide-circle-check.text-purple-400')).toBeTruthy()
  })

  it('shows the comment count only when there are comments', () => {
    const { rerender } = render(<IssueItem issue={issue({ comments: 4 })} />)
    expect(screen.getByText('4')).toBeInTheDocument()

    rerender(<IssueItem issue={issue({ comments: 0 })} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('highlights the matched substring in the title when filtering', () => {
    const { container } = render(<IssueItem issue={issue()} filterQuery="scroll" />)
    expect(container.querySelector('mark')?.textContent).toBe('scroll')
  })

  // The hover card already shows the full title, so the expand-on-hover overlay the branch and tag
  // rows use would only cover the row it is explaining. Asserted against the component rather than
  // the overlay it renders: jsdom reports every element as 0×0, so `HoverExpandLabel`'s
  // `scrollWidth > clientWidth` test never fires there and its absence would prove nothing.
  it('truncates the title plainly, without the expand-on-hover overlay', () => {
    render(<IssueItem issue={issue()} />)

    expect(hoverExpandLabel).not.toHaveBeenCalled()
    expect(screen.getByTestId('issue-item-12').querySelector('.truncate')).toBeTruthy()
  })
})

describe('IssueItem — interaction', () => {
  it('opens the issue in the app on click and on Enter, not in the browser', () => {
    const onOpen = vi.fn()
    render(<IssueItem issue={issue()} onOpen={onOpen} />)
    const row = screen.getByTestId('issue-item-12')

    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ number: 12 }))

    onOpen.mockClear()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ number: 12 }))

    // GitHub is an entry of the actions menu now, not what the row itself does.
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('opens the actions menu from the "…" button', async () => {
    const user = userEvent.setup()
    const onContextMenu = vi.fn()
    render(<IssueItem issue={issue()} onContextMenu={onContextMenu} />)

    await user.click(screen.getByTestId('issue-actions-button-12'))

    expect(onContextMenu).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ number: 12 })
    )
  })

  it('the "…" button does not also open the issue, by click or by keyboard', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<IssueItem issue={issue()} onOpen={onOpen} onContextMenu={vi.fn()} />)
    const button = screen.getByTestId('issue-actions-button-12')

    await user.click(button)
    expect(onOpen).not.toHaveBeenCalled()

    button.focus()
    await user.keyboard('{Enter}')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('hands a right-click to the action menu instead of opening the OS one', () => {
    const onContextMenu = vi.fn()
    render(<IssueItem issue={issue()} onContextMenu={onContextMenu} />)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    fireEvent(screen.getByTestId('issue-item-12'), event)

    expect(onContextMenu).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ number: 12 }))
    expect(event.defaultPrevented).toBe(true)
  })

  // Without a handler the row must leave the event alone, so the webview's own menu still works.
  it('leaves a right-click untouched when no menu handler is wired', () => {
    render(<IssueItem issue={issue()} />)

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    fireEvent(screen.getByTestId('issue-item-12'), event)

    expect(event.defaultPrevented).toBe(false)
  })
})

describe('IssueItem — hover preview', () => {
  it('reveals the issue preview card once the pointer rests on the row', async () => {
    vi.useFakeTimers()
    try {
      render(<IssueItem issue={issue({ labels: ['bug'] })} />)
      expect(screen.queryByTestId('issue-hover-card-12')).not.toBeInTheDocument()

      fireEvent.mouseEnter(screen.getByTestId('issue-item-12'))
      await vi.advanceTimersByTimeAsync(500)

      expect(screen.getByTestId('issue-hover-card-12')).toBeInTheDocument()
      expect(screen.getByText('bug')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
