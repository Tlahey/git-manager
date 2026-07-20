import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PullRequest } from '@git-manager/git-types'
import { PullRequestItem } from './PullRequestItem'

vi.mock('./HoverExpandLabel', () => ({
  HoverExpandLabel: ({
    children,
    className,
  }: {
    children: React.ReactNode
    className?: string
  }) => <span className={className}>{children}</span>,
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
    ...overrides,
  }
}

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

  it('shows a merge icon for a merged PR, a filled circle for open, and a plain circle otherwise', () => {
    const { container, rerender } = render(<PullRequestItem pr={pr({ state: 'merged' })} />)
    expect(container.querySelector('.lucide-git-merge')).toBeTruthy()

    rerender(<PullRequestItem pr={pr({ state: 'open' })} />)
    expect(container.querySelector('.fill-green-400')).toBeTruthy()

    rerender(<PullRequestItem pr={pr({ state: 'closed' })} />)
    expect(container.querySelector('.fill-green-400')).toBeFalsy()
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

  it('the external-link opens the PR URL without triggering onOpen', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(
      <PullRequestItem pr={pr({ url: 'https://github.com/owner/repo/pull/42' })} onOpen={onOpen} />
    )
    const link = screen.getByLabelText("Open in GitHub")
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pull/42')
    expect(link).toHaveAttribute('target', '_blank')
    await user.click(link)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
