import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PullRequest } from '@git-manager/git-types'
import { PrStatusTag } from './PrStatusTag'

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 123,
    title: 'PR',
    body: '',
    state: 'open',
    author: 'a',
    authorAvatar: '',
    headRef: 'feature',
    baseRef: 'main',
    url: '',
    ciStatus: null,
    createdAt: '',
    updatedAt: '',
    isDraft: false,
    ...overrides,
  }
}

describe('PrStatusTag', () => {
  it('shows the GitHub mark and the PR number', () => {
    const { container } = render(<PrStatusTag pr={pr({ number: 77 })} />)
    expect(screen.getByText('#77')).toBeInTheDocument()
    expect(container.querySelector('.lucide-github')).toBeTruthy()
  })

  it('renders a status-specific glyph', () => {
    const { container, rerender } = render(<PrStatusTag pr={pr({ state: 'merged' })} />)
    expect(container.querySelector('.lucide-git-merge')).toBeTruthy()

    rerender(<PrStatusTag pr={pr({ state: 'open', ciStatus: 'failure' })} />)
    expect(container.querySelector('.lucide-circle-x')).toBeTruthy()

    rerender(<PrStatusTag pr={pr({ state: 'open', ciStatus: 'pending' })} />)
    expect(container.querySelector('.lucide-clock')).toBeTruthy()

    rerender(<PrStatusTag pr={pr({ state: 'open' })} />)
    expect(container.querySelector('.lucide-git-pull-request')).toBeTruthy()
  })

  it('exposes a descriptive, translated aria-label including the number', () => {
    render(<PrStatusTag pr={pr({ number: 5, state: 'merged' })} />)
    const label = screen.getByRole('button').getAttribute('aria-label') ?? ''
    expect(label).toContain('#5')
    expect(label).toContain('merged')
  })

  it('opens the PR on click without bubbling to the row', () => {
    const onOpen = vi.fn()
    const rowClick = vi.fn()
    const item = pr()
    render(
      <div onClick={rowClick}>
        <PrStatusTag pr={item} onOpen={onOpen} />
      </div>
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(item)
    expect(rowClick).not.toHaveBeenCalled()
  })
})
