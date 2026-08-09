import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PullRequest } from '@git-manager/git-types'
import { PullRequestItem } from './PullRequestItem'

const { hoverExpandLabel } = vi.hoisted(() => ({ hoverExpandLabel: vi.fn() }))
// Spied on, not stubbed out, so the row's title can be asserted to no longer go through it.
vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: (props: { children: React.ReactNode; className?: string }) => {
    hoverExpandLabel(props)
    return <span className={props.className}>{props.children}</span>
  },
}))

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 42,
    title: 'Add feature',
    body: '',
    state: 'open',
    author: 'antoine',
    authorAvatar: '',
    headRef: 'feature',
    baseRef: 'main',
    url: 'https://github.com/owner/repo/pull/42',
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

describe('PullRequestItem — title', () => {
  // The hover card already shows the full title, so the expand-on-hover overlay would only cover
  // the row it is explaining. Asserted against the component rather than the overlay it renders:
  // jsdom reports every element as 0x0, so `HoverExpandLabel`'s `scrollWidth > clientWidth` test
  // never fires there and its absence would prove nothing.
  it('truncates plainly, without the expand-on-hover overlay', () => {
    render(<PullRequestItem pr={pr()} />)

    expect(hoverExpandLabel).not.toHaveBeenCalled()
    expect(screen.getByTestId('pr-item-42').querySelector('.truncate')).toBeTruthy()
  })
})

describe('PullRequestItem — content', () => {
  it('shows the PR number, title, author, and state label', () => {
    render(
      <PullRequestItem pr={pr({ number: 7, title: 'Fix bug', author: 'marie', state: 'open' })} />
    )
    expect(screen.getByText('#7 Fix bug')).toBeInTheDocument()
    expect(screen.getByText('marie')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
  })

  it.each([
    ['draft', 'Draft'],
    ['merged', 'Merged'],
    ['closed', 'Closed'],
  ] as const)('labels a %s PR as "%s"', (state, label) => {
    render(<PullRequestItem pr={pr({ state })} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  // The leading glyph distinguishes every status, not just merged-vs-not: a draft, a PR whose
  // checks are failing and a plain open one have to be tellable apart at a glance in the list.
  it.each([
    ['merged', '.lucide-git-merge'],
    ['closed', '.lucide-git-pull-request-closed'],
    ['draft', '.lucide-git-pull-request-draft'],
  ] as const)('shows the %s glyph in front of the row', (state, selector) => {
    const { container } = render(<PullRequestItem pr={pr({ state })} />)
    expect(container.querySelector(selector)).toBeTruthy()
  })

  it('distinguishes an open PR by its CI status: failing and running get their own glyph', () => {
    const { container, rerender } = render(
      <PullRequestItem pr={pr({ state: 'open', ciStatus: null })} />
    )
    expect(container.querySelector('.lucide-git-pull-request')).toBeTruthy()

    rerender(<PullRequestItem pr={pr({ state: 'open', ciStatus: 'failure' })} />)
    expect(container.querySelector('.lucide-circle-x')).toBeTruthy()

    rerender(<PullRequestItem pr={pr({ state: 'open', ciStatus: 'pending' })} />)
    expect(container.querySelector('.lucide-clock')).toBeTruthy()
  })

  it('indents a row nested under a PR sub-group header', () => {
    const { container } = render(<PullRequestItem pr={pr()} depth={1} />)
    expect(container.firstElementChild).toHaveClass('pl-10')
  })

  it('applies the selected styling when isSelected', () => {
    const { container } = render(<PullRequestItem pr={pr()} isSelected />)
    expect(container.firstElementChild).toHaveClass('bg-sidebar-accent')
  })

  it('highlights the matched substring in the title when filterQuery is provided', () => {
    const { container } = render(
      <PullRequestItem pr={pr({ title: 'Fix login bug' })} filterQuery="login" />
    )
    const mark = container.querySelector('mark')
    expect(mark?.textContent).toBe('login')
    expect(container.textContent).toContain('Fix login bug')
  })
})

describe('PullRequestItem — CI status icon', () => {
  it('shows nothing when ciStatus is null', () => {
    const { container } = render(<PullRequestItem pr={pr({ ciStatus: null })} />)
    expect(
      container.querySelector('.lucide-circle-check-big, .lucide-circle-x, .lucide-loader-circle')
    ).toBeFalsy()
  })

  it('shows a green check for success', () => {
    const { container } = render(<PullRequestItem pr={pr({ ciStatus: 'success' })} />)
    expect(
      container.querySelector('.text-green-400.lucide-circle-check-big, svg.text-green-400')
    ).toBeTruthy()
  })

  it('shows a red X for failure', () => {
    const { container } = render(<PullRequestItem pr={pr({ ciStatus: 'failure' })} />)
    expect(container.querySelector('.text-red-400')).toBeTruthy()
  })

  it('shows a spinning loader for pending', () => {
    const { container } = render(<PullRequestItem pr={pr({ ciStatus: 'pending' })} />)
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })
})

describe('PullRequestItem — interaction', () => {
  it('opens the PR on click and Enter', () => {
    const onOpen = vi.fn()
    const item = pr()
    render(<PullRequestItem pr={item} onOpen={onOpen} />)
    const row = screen.getByText('#42 Add feature').closest('[role="button"]')!

    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(item)

    onOpen.mockClear()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(item)
  })

  it('opens the actions menu from the "…" button', async () => {
    const user = userEvent.setup()
    const onContextMenu = vi.fn()
    render(<PullRequestItem pr={pr()} onContextMenu={onContextMenu} />)

    await user.click(screen.getByTestId('pr-actions-button-42'))

    expect(onContextMenu).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ number: 42 })
    )
  })

  it('hands a right-click to the same menu, without the OS one', () => {
    const onContextMenu = vi.fn()
    render(<PullRequestItem pr={pr()} onContextMenu={onContextMenu} />)

    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    fireEvent(screen.getByTestId('pr-item-42'), e)

    expect(onContextMenu).toHaveBeenCalledOnce()
    expect(e.defaultPrevented).toBe(true)
  })

  it('the "…" button does not also open the PR, by click or by keyboard', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<PullRequestItem pr={pr()} onOpen={onOpen} onContextMenu={vi.fn()} />)
    const button = screen.getByTestId('pr-actions-button-42')

    await user.click(button)
    expect(onOpen).not.toHaveBeenCalled()

    button.focus()
    await user.keyboard('{Enter}')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
